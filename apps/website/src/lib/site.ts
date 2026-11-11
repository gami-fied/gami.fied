/**
 * Facts about the site, in one place. Addresses can be changed per deployment through `PUBLIC_*`
 * environment variables (see `.env.example`), so previews and forks never need code changes.
 */
export const SITE = {
  name: 'Gami.Fied',
  tagline: 'The self-hosted, open-source gamification engine',
  description:
    'Turn events from your app into XP, streaks, badges, leaderboards and rewards. Self-hosted, open source, and your data stays yours.',
  url: import.meta.env.PUBLIC_SITE_URL || 'https://gami.fied.cc',
  github: 'https://github.com/gami-fied/gami.fied',
  releases: 'https://github.com/gami-fied/gami.fied/releases/latest',
  /** Previews and forks set this so search engines never index them. */
  noindex: import.meta.env.PUBLIC_NOINDEX === 'true',
} as const;

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
  /** Hidden on phones, to keep the header on one line. */
  wide?: boolean;
}

/** The header links. Pages are added here as Phase 9 builds them. */
export const NAV: NavLink[] = [
  { label: 'Docs', href: '/docs/' },
  { label: 'Releases', href: SITE.releases, external: true, wide: true },
  { label: 'GitHub', href: SITE.github, external: true },
];
