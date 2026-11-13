/**
 * Dashboard screenshots for the feature pages, taken from a live demo by `pnpm capture`
 * (scripts/capture.mjs, which keeps the same list of pages). A feature without a file shows none.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/screenshots/*.png', { eager: true });

/** The dashboard page each screenshot shows, for its caption. */
const PAGES: Record<string, string> = {
  progression: 'Achievements',
  economy: 'Store',
  competition: 'Leaderboard',
  community: 'Users',
  integrations: 'Developer Hub',
  administration: 'Rules',
};

export function screenshotFor(slug: string): { image: ImageMetadata; page: string } | null {
  const file = files[`../assets/screenshots/${slug}.png`];
  return file ? { image: file.default, page: PAGES[slug] ?? 'Dashboard' } : null;
}
