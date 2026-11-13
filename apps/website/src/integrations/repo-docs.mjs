// @ts-check
/**
 * Serves the repository's `docs/` folder through Starlight, so the guides are written once and read
 * the same on GitHub and on the website.
 *
 * Each Markdown file is copied into `src/content/docs/docs/` (ignored by git) with the changes the
 * website needs: the first heading becomes the page title, the first paragraph the description,
 * links between docs point at their website pages, and GitHub callouts become Starlight asides.
 * In development the folder is watched and copied again on every change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const source = join(repoRoot, 'docs');
const output = resolve(here, '../content/docs/docs');
const changelogOutput = resolve(here, '../content/changelog/CHANGELOG.md');

/** GitHub callouts and the Starlight aside each one becomes. */
const ALERTS = {
  NOTE: 'note',
  TIP: 'tip',
  IMPORTANT: 'note[Important]',
  WARNING: 'caution',
  CAUTION: 'danger',
};

/**
 * @param {string} dir
 * @returns {string[]} Markdown files under `dir`, as forward-slash paths relative to it.
 */
function markdownFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(join(dir, entry.name), rel);
    return entry.name.endsWith('.md') ? [rel] : [];
  });
}

/** `getting-started.md` → `getting-started`, `README.md` → `` (the docs home). */
const slugOf = (/** @type {string} */ rel) => rel.replace(/(^|\/)README\.md$/, '').replace(/\.md$/, '');

/**
 * Which docs are being written: the current ones at `/docs/`, or an older release's at
 * `/docs/v1.0/`, read from its git tag (WEB-18).
 * @typedef {{ base: string; ref: string; version: string | null }} DocsVersion
 */

/** @type {DocsVersion} */
const CURRENT = { base: '/docs/', ref: 'master', version: null };

/**
 * Points a link from a file in `docs/` at the right place on the website, or on GitHub for files
 * the website does not serve. Links in an older version's docs stay inside that version.
 * @param {string} url
 * @param {string} fromRel the linking file, relative to `docs/`
 * @param {string} repository
 * @param {DocsVersion} [docs]
 */
function rewriteLink(url, fromRel, repository, docs = CURRENT) {
  if (/^([a-z]+:|#|\/)/i.test(url)) return url;
  const [path = '', hash = ''] = url.split(/(?=#)/);
  const target = posix.normalize(posix.join('docs', posix.dirname(fromRel), path));
  if (target === 'docs/openapi.json') return docs.version ? `${repository}/blob/${docs.ref}/docs/openapi.json` : `/docs/api/${hash}`;
  if (target === 'CHANGELOG.md') return `/changelog/${hash}`;
  if (target.startsWith('docs/') && target.endsWith('.md')) {
    const slug = slugOf(target.slice('docs/'.length));
    return `${docs.base}${slug ? `${slug}/` : ''}${hash}`;
  }
  return `${repository}/blob/${docs.ref}/${target}${hash}`;
}

/** Rewrites the links in one line of Markdown, leaving inline code alone. */
const rewriteLine = (/** @type {string} */ line, /** @type {string} */ rel, /** @type {string} */ repository, /** @type {DocsVersion} */ docs = CURRENT) =>
  line
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_, url, label = '') => `](${rewriteLink(url, rel, repository, docs)}${label})`),
    )
    .join('');

/** Plain text of a Markdown line, for the page description. */
const plain = (/** @type {string} */ text) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Cuts a description to a sentence that fits in search results. */
function shorten(/** @type {string} */ text, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  return sentence > 60 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * @param {string} markdown
 * @param {string} rel
 * @param {string} repository
 * @param {DocsVersion} [docs]
 */
export function transform(markdown, rel, repository, docs = CURRENT) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  /** @type {string[]} */
  const out = [];
  let title = '';
  let description = '';
  let fence = '';
  let alert = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? '';
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (!fence) fence = marker;
      else if (marker.startsWith(fence)) fence = '';
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }

    // The first heading is the page title, which Starlight shows itself.
    if (!title) {
      const heading = /^#\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        title = plain(heading[1] ?? '');
        while (lines[i + 1]?.trim() === '') i++;
        continue;
      }
    }
    if (title && !description && line.trim() && !/^(#|\||>|-{3,}|[-*+] |\d+\. |<|!\[)/.test(line.trim())) {
      description = shorten(plain(line));
    }

    // `> [!NOTE]` and the quoted lines after it become a Starlight aside.
    const alertStart = /^>\s*\[!(\w+)\]\s*$/.exec(line);
    if (alertStart && alertStart[1] && alertStart[1].toUpperCase() in ALERTS) {
      out.push(`:::${ALERTS[/** @type {keyof typeof ALERTS} */ (alertStart[1].toUpperCase())]}`);
      alert = true;
      continue;
    }
    if (alert) {
      if (line.startsWith('>')) line = line.replace(/^>\s?/, '');
      else {
        out.push(':::');
        alert = false;
      }
    }

    out.push(rewriteLine(line, rel, repository, docs));
  }
  if (alert) out.push(':::');

  // Pages come and go between releases, so the banner points at the docs home.
  const latest = CURRENT.base;
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title || slugOf(rel) || 'Documentation')}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(docs.version
      ? [
          // An older release: no editing, kept out of search, and a way back to the latest docs.
          // The slug is set so the dot in "v1.0" survives; from the file path it would become "v10".
          `slug: ${JSON.stringify(`${docs.base.replace(/^\/|\/$/g, '')}${slugOf(rel) ? `/${slugOf(rel)}` : ''}`)}`,
          'editUrl: false',
          'pagefind: false',
          'banner:',
          `  content: ${JSON.stringify(`These are the docs for Gami.Fied ${docs.version}. <a href="${latest}">Read the latest docs</a>.`)}`,
        ]
      : [`editUrl: ${JSON.stringify(`${repository}/edit/master/docs/${rel}`)}`]),
    '---',
    '',
  ];
  return `${frontmatter.join('\n')}${out.join('\n').trim()}\n`;
}

const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * The older releases whose docs are kept (WEB-18): the newest stable tag of each earlier minor
 * version, such as v1.0.3 for 1.0. The current version's docs are the ones in the working tree.
 * Without git or tags (a shallow clone), there are none, and only the current docs are built.
 * @returns {{ version: string; tag: string }[]}
 */
export function olderDocVersions() {
  let tags;
  try {
    tags = git(['tag', '--list', 'v*']).split('\n').map((tag) => tag.trim()).filter(Boolean);
  } catch {
    return [];
  }
  const current = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
  const [curMajor = 0, curMinor = 0] = current.split('.').map(Number);
  /** @type {Map<string, { tag: string; patch: number }>} */
  const newest = new Map();
  for (const tag of tags) {
    const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (!match) continue;
    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (major > curMajor || (major === curMajor && minor >= curMinor)) continue;
    const key = `${major}.${minor}`;
    if ((newest.get(key)?.patch ?? -1) < patch) newest.set(key, { tag, patch });
  }
  return [...newest.entries()]
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .map(([version, { tag }]) => ({ version, tag }));
}

/** Writes an older release's docs, read from its tag, under `v1.0/`. Returns the files written. */
function syncVersion(/** @type {string} */ repository, /** @type {{ version: string; tag: string }} */ { version, tag }) {
  const files = git(['ls-tree', '-r', '--name-only', tag, '--', 'docs/'])
    .split('\n')
    .map((path) => path.trim())
    .filter((path) => path.endsWith('.md'));
  const docs = { base: `/docs/v${version}/`, ref: tag, version };
  return files.map((path) => {
    const rel = path.slice('docs/'.length);
    const target = join(output, `v${version}`, rel.replace(/(^|\/)README\.md$/, '$1index.md'));
    const next = transform(git(['show', `${tag}:${path}`]), rel, repository, docs);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== next) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, next);
    }
    return target;
  });
}

/** Copies every doc, writing only files that changed so the dev server reloads only what it must. */
export function syncDocs(/** @type {string} */ repository) {
  const files = markdownFiles(source);
  const written = new Set();
  for (const rel of files) {
    const outRel = rel.replace(/(^|\/)README\.md$/, '$1index.md');
    const target = join(output, outRel);
    const next = transform(readFileSync(join(source, rel), 'utf8'), rel, repository);
    written.add(target);
    if (existsSync(target) && readFileSync(target, 'utf8') === next) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
  }
  // Older releases' docs, from their tags. They only change when a release is tagged.
  for (const older of olderDocVersions()) {
    for (const target of syncVersion(repository, older)) written.add(target);
  }
  syncChangelog(repository);
  // Remove pages whose source was deleted or renamed.
  if (existsSync(output)) removeStale(output, written);
  return files.length;
}

/** Copies CHANGELOG.md for the changelog page, with its repository links rewritten like the docs. */
function syncChangelog(/** @type {string} */ repository) {
  let fence = false;
  const next = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      return fence ? line : rewriteLine(line, '../CHANGELOG.md', repository);
    })
    .join('\n');
  if (existsSync(changelogOutput) && readFileSync(changelogOutput, 'utf8') === next) return;
  mkdirSync(dirname(changelogOutput), { recursive: true });
  writeFileSync(changelogOutput, next);
}

function removeStale(/** @type {string} */ dir, /** @type {Set<string>} */ keep) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      removeStale(path, keep);
      if (readdirSync(path).length === 0) rmSync(path, { recursive: true });
    } else if (!keep.has(path)) rmSync(path);
  }
}

/**
 * @param {{ repository: string }} options
 * @returns {import('astro').AstroIntegration}
 */
export default function repoDocs({ repository }) {
  return {
    name: 'gami:repo-docs',
    hooks: {
      'astro:config:setup': ({ logger }) => {
        const count = syncDocs(repository);
        logger.info(`Copied ${count} pages from ${relative(process.cwd(), source) || 'docs'}`);
      },
      'astro:server:setup': ({ server, logger }) => {
        server.watcher.add(source);
        server.watcher.add(join(repoRoot, 'CHANGELOG.md'));
        const resync = (/** @type {string} */ file) => {
          const path = resolve(file);
          if (!path.startsWith(source) && path !== join(repoRoot, 'CHANGELOG.md')) return;
          syncDocs(repository);
          logger.info(`Updated docs from ${relative(repoRoot, file)}`);
        };
        server.watcher.on('add', resync);
        server.watcher.on('change', resync);
        server.watcher.on('unlink', resync);
      },
    },
  };
}

