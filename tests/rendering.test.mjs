/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Mail CSS and browser-session parsing regressions with bounded algorithm checks.
 *
 * @module tests/rendering
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';

/** Bundles actual modules once; the worker prevents a quadratic regression from hanging the test process. */
const source = (
  await build({
    stdin: {
      contents:
        "export {darkCSS, darkColor} from './src/shared/sanitize'; export {elements} from './src/background/providers/session';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  })
).outputFiles[0].text;

/** Runs a synthetic mail input in an isolated thread with a generous two-second CPU/hang ceiling. */
function bounded(operation) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort, workerData} = require('node:worker_threads');\n${source}\nparentPort.postMessage((${operation})(module.exports));`,
      {eval: true},
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Mail parsing exceeded the 2 s regression budget'));
    }, 2000);
    worker.once('message', value => {
      clearTimeout(timer);
      resolve(value);
    });
    worker.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('large CSS comments remain intact without blocking mail rendering', async () => {
  const result = await bounded(`({darkCSS}) => {
    const comment = '/*' + 'x'.repeat(200000) + '*/';
    return darkCSS(comment) === comment && darkCSS(comment.slice(0, -2)) === comment.slice(0, -2);
  }`);
  assert.equal(result, true);
});

test('dark CSS adapts real colours while preserving URLs, strings and comments', async () => {
  const result = await bounded(`({darkCSS, darkColor}) => {
    const css = '/* white;color:black */background:url("https://example.test/white/(black).png") white;content:"white;color:black";color:rgb(0,0,0)';
    const expected = '/* white;color:black */background:url("https://example.test/white/(black).png") ' + darkColor('white', true) + ';content:"white;color:black";color:' + darkColor('rgb(0,0,0)', false);
    return darkCSS(css) === expected;
  }`);
  assert.equal(result, true);
});

test('deep HTML blocks retain complete boundaries within the parsing budget', async () => {
  const result = await bounded(`({elements}) => {
    const block = '<div class="target">' + '<div>'.repeat(20000) + 'body' + '</div>'.repeat(20000) + '</div>';
    const input = '<div class="other">ignored</div>' + block + '<div class="target">second</div>';
    const matches = elements(input, 'div', /target/);
    const attribute = '<div title="' + '<div '.repeat(20000) + '">ignored</div>';
    return matches.length === 2 && matches[0] === block && matches[1].includes('second') && elements(attribute, 'div', /target/).length === 0;
  }`);
  assert.equal(result, true);
});
