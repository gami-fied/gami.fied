import { SITE } from './site';

/** Below this, a star count says more about the project's age than its worth, so it is not shown. */
const SHOW_FROM = 50;

let cached: Promise<number | null> | undefined;

/**
 * The repository's star count, read once while the site is built. Null when it cannot be read or
 * is too small to show, so the header never depends on GitHub answering.
 */
export function githubStars(): Promise<number | null> {
  cached ??= (async () => {
    const repo = new URL(SITE.github).pathname.replace(/^\/|\/$/g, '');
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'site-build' },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      const stars = ((await response.json()) as { stargazers_count?: unknown }).stargazers_count;
      return typeof stars === 'number' && stars >= SHOW_FROM ? stars : null;
    } catch {
      return null;
    }
  })();
  return cached;
}

/** 1234 as "1.2k". */
export const compactCount = (count: number): string => (count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(count));
