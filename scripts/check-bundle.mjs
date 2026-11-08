#!/usr/bin/env node
// Fails the build if the dashboard's JavaScript grows past its budget.
// Run after `pnpm build`. Raise a limit only on purpose, in the same change that needs it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const CHUNKS_DIR = 'apps/dashboard/.next/static/chunks';
// The total covers every route's chunks, so it grows with the number of pages; a visitor only loads
// the chunks for the page they open. Raised from 450 in 1.1.0, which added about twenty pages
// (store, leagues, segments, invites, connectors, admin features and more) and Motion and GSAP for
// the admin screens. The per-chunk limit below is what keeps any single page light.
const TOTAL_LIMIT_KB = 700;
const SINGLE_CHUNK_LIMIT_KB = 120;

const files = readdirSync(CHUNKS_DIR, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.js'));

const sizes = files
  .map((file) => ({
    file,
    kb: gzipSync(readFileSync(join(CHUNKS_DIR, file))).length / 1024,
  }))
  .sort((a, b) => b.kb - a.kb);

const total = sizes.reduce((sum, { kb }) => sum + kb, 0);
const oversized = sizes.filter(({ kb }) => kb > SINGLE_CHUNK_LIMIT_KB);

console.log(`Dashboard JavaScript: ${total.toFixed(0)} KB compressed in ${files.length} files`);
console.log(`Largest: ${sizes[0].file} at ${sizes[0].kb.toFixed(0)} KB`);

if (total > TOTAL_LIMIT_KB) {
  console.error(`Over the ${TOTAL_LIMIT_KB} KB budget.`);
  process.exitCode = 1;
}
for (const { file, kb } of oversized) {
  console.error(`${file} is ${kb.toFixed(0)} KB, over the ${SINGLE_CHUNK_LIMIT_KB} KB limit.`);
  process.exitCode = 1;
}
