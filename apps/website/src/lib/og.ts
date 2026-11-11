/**
 * The Open Graph images built for the site, one per entry, at `/og/<key>.png`. Pages point at
 * theirs through the `og` prop of the layout. Add an entry whenever a page is added.
 */
export interface OgPage {
  title: string;
  description: string;
}

export const OG_PAGES: Record<string, OgPage> = {
  index: {
    title: 'Gami.Fied',
    description: 'The self-hosted, open-source gamification engine. XP, streaks, badges, leaderboards and rewards.',
  },
  docs: {
    title: 'Gami.Fied docs',
    description: 'Install it, send your first event, and build streaks, achievements, leagues and a reward store.',
  },
  '404': {
    title: 'Page not found',
    description: 'This page does not exist, but your streak is safe.',
  },
};

export const ogImagePath = (key: string) => `/og/${key}.png`;
