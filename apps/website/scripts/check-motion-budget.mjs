// The animation budget (WEB-35), checked on the built site. For each page it follows every script
// the page can load, including lazy imports, and adds up the compressed size of animation code:
// files the build names "motion-" (GSAP, Motion and src/motion; see astro.config.mjs).
//
//   node scripts/check-motion-budget.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');

/** Most animation code, compressed, each page may load. */
const BUDGETS = [
  { page: '/', maxKb: 60 },
  { page: '/docs/', maxKb: 0 },
  { page: '/docs/install/docker-compose/', maxKb: 0 },
  { page: '/docs/api/', maxKb: 0 },
];

const fileFor = (url) => join(dist, url, 'index.html');

/** Script URLs a page names: script tags, module preloads and imports in inline scripts. */
function entries(html) {
  const found = new Set();
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) found.add(m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g)) found.add(m[1]);
  for (const m of html.matchAll(/["'](\/_astro\/[^"']+\.js)["']/g)) found.add(m[1]);
  return [...found].filter((url) => url.startsWith('/'));
}

/** Every file a script imports, statically or lazily, followed all the way down. */
function reachable(urls) {
  const seen = new Set();
  const queue = [...urls];
  while (queue.length) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    const file = join(dist, url);
    if (!existsSync(file)) continue;
    seen.add(url);
    const code = readFileSync(file, 'utf8');
    // Static imports, and lazy ones, which the build writes with backticks.
    for (const m of code.matchAll(/(?:from\s*|import\s*\(?\s*)["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)) queue.push(posix.join(posix.dirname(url), m[1]));
  }
  return [...seen];
}

let failed = false;
for (const { page, maxKb } of BUDGETS) {
  const html = readFileSync(fileFor(page), 'utf8');
  const scripts = reachable(entries(html));
  const animation = scripts.filter((url) => posix.basename(url).startsWith('motion-'));
  const bytes = animation.reduce((total, url) => total + gzipSync(readFileSync(join(dist, url))).length, 0);
  const kb = bytes / 1024;
  const ok = kb <= maxKb;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${page.padEnd(32)} ${kb.toFixed(1).padStart(6)} KB of animation code (budget ${maxKb} KB)`);
  if (!ok || process.argv.includes('--verbose')) {
    for (const url of animation) console.log(`       ${(gzipSync(readFileSync(join(dist, url))).length / 1024).toFixed(1).padStart(6)} KB  ${posix.basename(url)}`);
  }
}
if (failed) {
  console.error('\nThe animation budget is exceeded. Load the scene lazily, or make it smaller.');
  process.exit(1);
}
