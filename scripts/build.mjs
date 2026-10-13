/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Bundles `src/` into an unpacked Manifest V3 extension.
 *
 * esbuild bundles each TypeScript entry point into one classic script (no
 * runtime module loading), unminified so reviewers can read it; Solid JSX
 * is compiled ahead of time, so no runtime compiler or `eval` ships. Sass
 * compiles SCSS without source maps. The manifest is adapted per target:
 *
 * - `chromium` (default, `build/`): Chrome, Edge, Brave, Opera, Yandex Browser.
 * - `safari` (`build-safari/`): input for `xcrun safari-web-extension-converter`;
 *   drops keys Safari ignores or rejects (see docs/SAFARI.md).
 *
 * The sandbox build (`sandbox: true`, `build-sandbox/`) answers client
 * requests from fixtures (`src/sandbox/`) instead of the service worker; in
 * other builds `__SANDBOX__` is `false` and the fixtures are tree-shaken.
 *
 * Usage: `node scripts/build.mjs [--target chromium|safari] [--outdir <directory>]`.
 */
import {copyFile, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {solidPlugin} from 'esbuild-plugin-solid';
import {compileStyles} from './styles.mjs';

/** Repository root. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundled entry points by output name. */
const entries = {
  background: 'src/background/index.ts',
  client: 'src/client/index.tsx',
  options: 'src/options/index.ts',
};

/** Copied files: output path → source path. */
export const assets = {
  'popup.html': 'src/client/popup.html',
  'app.html': 'src/client/app.html',
  'options.html': 'src/options/options.html',
  'icons/icon16.png': 'src/icons/icon16.png',
  'icons/icon32.png': 'src/icons/icon32.png',
  'icons/icon48.png': 'src/icons/icon48.png',
  'icons/icon128.png': 'src/icons/icon128.png',
  'fonts/inter-latin.woff2': 'src/fonts/inter-latin.woff2',
  'fonts/inter-cyrillic.woff2': 'src/fonts/inter-cyrillic.woff2',
  'fonts/OFL.txt': 'src/fonts/OFL.txt',
};

/** Release builds read `chrome.i18n`: the sandbox's bundled messages become an empty module. */
const releaseMessages = {
  name: 'release-messages',
  setup(build) {
    build.onResolve({filter: /\/sandbox\/messages$/}, () => ({path: 'sandbox-messages', namespace: 'release'}));
    build.onLoad({filter: /.*/, namespace: 'release'}, () => ({
      contents: "export const sandboxMessages = () => ({}); export const sandboxLocale = () => 'en';",
      loader: 'js',
    }));
  },
};

/** Returns [assets] with every `src/_locales/<locale>/messages.json`. */
export async function localeAssets() {
  const locales = await readdir(resolve(root, 'src/_locales'));
  return {
    ...assets,
    ...Object.fromEntries(
      locales.sort().map(name => [`_locales/${name}/messages.json`, `src/_locales/${name}/messages.json`]),
    ),
  };
}

/** Files copied into the sandbox build only: output path → source path. */
export const sandboxAssets = {
  'index.html': 'src/sandbox/index.html',
};

/** Build targets: output directory and manifest adapter. */
export const targets = {
  chromium: {outdir: 'build', manifest: manifest => manifest},
  safari: {
    outdir: 'build-safari',
    /** Safari ignores `key` and `minimum_chrome_version`, and has no `identity` or `notifications` APIs. */
    manifest: manifest => {
      const {optional_permissions: optional = [], permissions, ...rest} = manifest;
      delete rest.key;
      delete rest.minimum_chrome_version;
      const kept = optional.filter(name => name !== 'identity');
      return {
        ...rest,
        permissions: permissions.filter(name => name !== 'notifications'),
        ...(kept.length ? {optional_permissions: kept} : {}),
        browser_specific_settings: {safari: {strict_min_version: '16.4'}},
      };
    },
  },
};

/**
 * Builds the extension for [target] into [outdir], replacing its previous contents.
 *
 * @param {Object} [options]
 * @param {'chromium'|'safari'} [options.target='chromium'] The browser family.
 * @param {string} [options.outdir] Output directory; defaults to the target's, or `build-sandbox/`.
 * @param {boolean} [options.sandbox=false] Answer client requests from fixtures (see `src/sandbox/`).
 * @returns {Promise<string>} The output directory.
 */
export async function buildExtension({target = 'chromium', outdir, sandbox = false} = {}) {
  const config = targets[target];
  if (!config) throw new Error(`Unknown target: ${target}`);
  const out = outdir || resolve(root, sandbox ? 'build-sandbox' : config.outdir);
  const styles = compileStyles();
  await rm(out, {recursive: true, force: true});
  await build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: out,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome116', 'safari16'],
    charset: 'utf8',
    legalComments: 'none',
    banner: {js: "'use strict';"},
    define: {__TARGET__: JSON.stringify(target), __SANDBOX__: JSON.stringify(sandbox)},
    logLevel: 'warning',
    plugins: [solidPlugin(), ...(sandbox ? [] : [releaseMessages])],
  });
  for (const [name, {css}] of Object.entries(styles)) await writeFile(resolve(out, name), css);
  for (const [name, source] of Object.entries({...(await localeAssets()), ...(sandbox ? sandboxAssets : {})})) {
    await mkdir(dirname(resolve(out, name)), {recursive: true});
    await copyFile(resolve(root, source), resolve(out, name));
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
  await writeFile(resolve(out, 'manifest.json'), `${JSON.stringify(config.manifest(manifest), null, 2)}\n`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = name => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const outdir = option('--outdir');
  const out = await buildExtension({target: option('--target'), outdir: outdir && resolve(outdir)});
  console.log(`Built the unpacked extension in ${relative(root, out) || '.'}/.`);
}
