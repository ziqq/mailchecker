/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Builds the sandbox (`build-sandbox/`) and serves it on localhost.
 *
 * The client pages run in a plain browser tab and answer their requests from
 * fixtures (`src/sandbox/`): no extension, accounts or network. Pages get the
 * extension's CSP, so a script or style that would break in the extension
 * breaks here too.
 *
 * Usage: `node scripts/sandbox.mjs [--port 8080] [--host 127.0.0.1]`.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, relative, resolve, sep} from 'node:path';
import {buildExtension, root} from './build.mjs';

/** Media types by file extension. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

/** Returns the value of a `--name value` argument. */
const option = name => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};

const port = Number(option('--port') || 8080);
const host = option('--host') || '127.0.0.1';
const manifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
const csp = manifest.content_security_policy.extension_pages;
const out = await buildExtension({sandbox: true});

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const file = resolve(out, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(out + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('Not found');
  }
});

server.listen(port, host, () =>
  console.log(`Sandbox from ${relative(root, out)}/ at http://${host}:${port}/ (Ctrl+C to stop).`),
);
