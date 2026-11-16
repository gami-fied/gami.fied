/* global URL, console -- this script runs in Node. */
// Bundles the elements into one script a page can load with a <script> tag: React, the SDK, the
// components and their stylesheet, all inside. `tsc` has already written the module build for
// people who use a bundler; this adds dist/gami-elements.js beside it.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const css = readFileSync(here('../react/src/styles.css'), 'utf8');

await build({
  entryPoints: [here('src/index.ts')],
  outfile: here('dist/gami-elements.js'),
  bundle: true,
  format: 'iife',
  globalName: 'GamiElements',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  define: { __GAMI_CSS__: JSON.stringify(css), 'process.env.NODE_ENV': '"production"' },
});

// The module build gets the stylesheet too: the place where the source reads it is filled in.
const moduleFile = here('dist/index.js');
const moduleSource = readFileSync(moduleFile, 'utf8');
const reads = "typeof __GAMI_CSS__ === 'string' ? __GAMI_CSS__ : ''";
if (!moduleSource.includes(reads)) throw new Error('dist/index.js no longer reads the stylesheet where the build expects it');
writeFileSync(moduleFile, moduleSource.replace(reads, JSON.stringify(css)));

const kb = (statSync(here('dist/gami-elements.js')).size / 1024).toFixed(0);
console.log(`Wrote dist/gami-elements.js (${kb} KB)`);
