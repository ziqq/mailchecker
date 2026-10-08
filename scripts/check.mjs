/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Repository consistency checks run by `npm run check`.
 *
 * Builds a fresh bundle into a temporary directory and verifies that the
 * manifest, pages and icons it references exist, that the versions in the
 * manifest, `package.json` and `CHANGELOG.md` match, that the CSP stays
 * strict and that no source uses `innerHTML` or `eval`.
 */
import {mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {buildExtension, root} from './build.mjs';

/** Collected failures. */
const failures = [];

/** Records a failure when [condition] is false. */
const expect = (condition, message) => condition || failures.push(message);

const manifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');

expect(manifest.manifest_version === 3, 'manifest_version must be 3.');
expect(manifest.version === pkg.version, `package.json version ${pkg.version} ≠ manifest ${manifest.version}.`);
expect(
  changelog.match(/^## (\S+)/m)?.[1] === manifest.version,
  'The newest CHANGELOG.md entry must match the version.',
);
expect(
  manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'none'; base-uri 'none'",
  'The extension-page CSP must stay strict.',
);
expect(!manifest.permissions.includes('identity'), '`identity` must stay an optional permission.');

/** Lists files under a directory recursively. */
async function files(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map(entry => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])),
  );
  return nested.flat();
}

for (const file of await files(resolve(root, 'src'))) {
  if (!/\.(ts|js)$/.test(file)) continue;
  const source = await readFile(file, 'utf8');
  expect(
    !/\.innerHTML\s*=|\binsertAdjacentHTML\b|\beval\(|new Function\(/.test(source),
    `${file}: unsafe DOM/eval API.`,
  );
}

for (const target of ['chromium', 'safari']) {
  const outdir = await mkdtemp(join(tmpdir(), `mailchecker-${target}-`));
  try {
    await buildExtension({target, outdir});
    const built = JSON.parse(await readFile(join(outdir, 'manifest.json'), 'utf8'));
    const referenced = [
      built.background.service_worker,
      built.action.default_popup,
      built.options_page,
      ...Object.values(built.icons),
      ...Object.values(built.action.default_icon),
      'app.html',
      'client.js',
      'client.css',
      'options.js',
      'options.css',
    ];
    for (const name of referenced) {
      const info = await stat(join(outdir, name)).catch(() => null);
      expect(info?.isFile() && info.size > 0, `${target}: missing build file ${name}.`);
    }
    if (target === 'safari') {
      expect(!('key' in built) && !('minimum_chrome_version' in built), 'safari: Chrome-only keys must be removed.');
      expect(!built.permissions.includes('notifications'), 'safari: notifications are unsupported.');
      expect(!(built.optional_permissions || []).includes('identity'), 'safari: identity is unsupported.');
    }
  } finally {
    await rm(outdir, {recursive: true, force: true});
  }
}

if (failures.length) {
  console.error(failures.map(message => `✗ ${message}`).join('\n'));
  process.exit(1);
}
console.log('Repository checks passed.');
