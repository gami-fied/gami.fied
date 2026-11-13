// Checks every internal link and anchor in the built site, so a renamed page or heading fails the
// build instead of shipping a dead link. Run after `astro build`: `node scripts/check-links.mjs`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
if (!existsSync(dist)) {
  console.error('No dist folder. Run `pnpm build` first.');
  process.exit(1);
}

/** @returns {string[]} */
const htmlFiles = (/** @type {string} */ dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });

const decode = (/** @type {string} */ text) =>
  text.replace(/&amp;|&#38;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'");

/** The URL path a built file is served at: `docs/index.html` → `/docs/`. */
const urlOf = (/** @type {string} */ file) =>
  `/${relative(dist, file).split(sep).join('/')}`.replace(/index\.html$/, '').replace(/\.html$/, '');

/** The built file for a URL path, or undefined when nothing is served there. */
function fileFor(/** @type {string} */ path) {
  const clean = decodeURIComponent(path).replace(/^\//, '');
  for (const candidate of [clean, join(clean, 'index.html'), `${clean}.html`]) {
    const full = join(dist, candidate);
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return undefined;
}

/** @type {Map<string, Set<string>>} */
const idsCache = new Map();
function idsIn(/** @type {string} */ file) {
  let ids = idsCache.get(file);
  if (!ids) {
    const html = readFileSync(file, 'utf8');
    ids = new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => decode(m[1] ?? '')));
    idsCache.set(file, ids);
  }
  return ids;
}

const files = htmlFiles(dist);
/** @type {Set<string>} */
const problems = new Set();
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const page = urlOf(file);
  for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const href = decode(match[1] ?? '');
    // External links, mail links and protocol-relative links are not checked here.
    if (!href || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
    checked++;
    const [rawPath = '', hash = ''] = href.split('#');
    const path = rawPath.split('?')[0] ?? '';
    const base = page.endsWith('/') ? page : posix.dirname(page);
    const target = path ? fileFor(path.startsWith('/') ? path : posix.join(base, path)) : file;
    if (!target) {
      problems.add(`${page}: links to ${href}, which does not exist`);
      continue;
    }
    if (hash && target.endsWith('.html') && !idsIn(target).has(decodeURIComponent(hash))) {
      problems.add(`${page}: links to ${href}, but that page has no #${hash}`);
    }
  }
}

if (problems.size) {
  console.error(`Found ${problems.size} broken links in ${files.length} pages:\n`);
  console.error([...problems].map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Checked ${checked} internal links in ${files.length} pages. None are broken.`);
