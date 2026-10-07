/**
 * Bundles `src/` into an unpacked Manifest V3 extension in `build/`.
 *
 * esbuild bundles each entry point into one classic script (no runtime
 * module loading), unminified so reviewers can read it. Sass compiles SCSS
 * to CSS without source maps. The manifest, pages and icons are copied
 * unchanged.
 *
 * Usage: `node scripts/build.mjs [--outdir <directory>]`.
 */
import {copyFile, mkdir, rm, writeFile} from 'node:fs/promises';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {compileStyles} from './styles.mjs';

/** Repository root. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundled entry points by output name. */
const entries = {
  background: 'src/background/index.ts',
  popup: 'src/popup/index.ts',
  options: 'src/options/index.ts',
};

/** Copied files: output path → source path. */
export const assets = {
  'manifest.json': 'src/manifest.json',
  'popup.html': 'src/popup/popup.html',
  'options.html': 'src/options/options.html',
  'icons/icon16.png': 'src/icons/icon16.png',
  'icons/icon32.png': 'src/icons/icon32.png',
  'icons/icon48.png': 'src/icons/icon48.png',
  'icons/icon128.png': 'src/icons/icon128.png',
};

/**
 * Builds the extension into [outdir], replacing its previous contents.
 *
 * @param {string} [outdir=build/] Output directory.
 * @returns {Promise<string>} The output directory.
 */
export async function buildExtension(outdir = resolve(root, 'build')) {
  const styles = compileStyles();
  await rm(outdir, {recursive: true, force: true});
  await build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome116',
    charset: 'utf8',
    legalComments: 'none',
    banner: {js: "'use strict';"},
    logLevel: 'warning',
  });
  for (const [name, {css}] of Object.entries(styles)) await writeFile(resolve(outdir, name), css);
  for (const [name, source] of Object.entries(assets)) {
    await mkdir(dirname(resolve(outdir, name)), {recursive: true});
    await copyFile(resolve(root, source), resolve(outdir, name));
  }
  return outdir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--outdir');
  const outdir = await buildExtension(index > 0 ? resolve(process.argv[index + 1]) : undefined);
  console.log(`Built the unpacked extension in ${relative(root, outdir) || '.'}/.`);
}
