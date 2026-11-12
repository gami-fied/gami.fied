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
 * Points a link from a file in `docs/` at the right place on the website, or on GitHub for files
 * the website does not serve.
 * @param {string} url
 * @param {string} fromRel the linking file, relative to `docs/`
 * @param {string} repository
 */
function rewriteLink(url, fromRel, repository) {
  if (/^([a-z]+:|#|\/)/i.test(url)) return url;
  const [path = '', hash = ''] = url.split(/(?=#)/);
  const target = posix.normalize(posix.join('docs', posix.dirname(fromRel), path));
  if (target === 'docs/openapi.json') return `/docs/api/${hash}`;
  if (target === 'CHANGELOG.md') return `/changelog/${hash}`;
  if (target.startsWith('docs/') && target.endsWith('.md')) {
    const slug = slugOf(target.slice('docs/'.length));
    return `/docs/${slug ? `${slug}/` : ''}${hash}`;
  }
  return `${repository}/blob/master/${target}${hash}`;
}

/** Rewrites the links in one line of Markdown, leaving inline code alone. */
const rewriteLine = (/** @type {string} */ line, /** @type {string} */ rel, /** @type {string} */ repository) =>
  line
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_, url, label = '') => `](${rewriteLink(url, rel, repository)}${label})`),
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
 */
export function transform(markdown, rel, repository) {
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

    out.push(rewriteLine(line, rel, repository));
  }
  if (alert) out.push(':::');

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title || slugOf(rel) || 'Documentation')}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    `editUrl: ${JSON.stringify(`${repository}/edit/master/docs/${rel}`)}`,
    '---',
    '',
  ];
  return `${frontmatter.join('\n')}${out.join('\n').trim()}\n`;
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

