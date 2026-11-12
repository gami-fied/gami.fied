/**
 * The Open Graph images built for the site, one per entry, at `/og/<key>.png`. Pages point at
 * theirs through the `og` prop of the layout. Add an entry whenever a page is added.
 */
import { FEATURES } from './features';

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
  features: {
    title: 'Features',
    description: 'Progression, a points economy, competition, community, integrations and administration, in one open-source engine.',
  },
  compare: {
    title: 'How Gami.Fied compares',
    description: 'Hosted APIs, loyalty engines, open-source libraries and building it yourself, including where Gami.Fied is weaker.',
  },
  playground: {
    title: 'Playground',
    description: 'Write gamification rules and watch a player earn XP, streaks and badges, in your browser with the real engine.',
  },
  pricing: {
    title: 'Pricing',
    description: 'Community is free and open source forever. Cloud and Enterprise editions are coming.',
  },
  blog: { title: 'Blog', description: 'Releases, guides on gamification design, and what is next.' },
  changelog: { title: 'Changelog', description: 'Every Gami.Fied release, what changed, and how to upgrade.' },
  legal: { title: 'Privacy, terms and licences', description: 'What the site collects, the demo terms, and the AGPL and MIT licences in plain words.' },
  ...Object.fromEntries(
    FEATURES.map((feature) => [`features/${feature.slug}`, { title: feature.name, description: feature.tagline }])
  ),
};

export const ogImagePath = (key: string) => `/og/${key}.png`;
