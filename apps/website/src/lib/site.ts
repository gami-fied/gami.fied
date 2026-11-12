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
  issues: 'https://github.com/gami-fied/gami.fied/issues',
  /** Where the "Join the waitlist" buttons go, such as a form. Without it they are hidden. */
  waitlistUrl: import.meta.env.PUBLIC_WAITLIST_URL || '',
  /** A contact address for the legal pages. Without it they point to GitHub. */
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL || '',
  /** The demo dashboard. "Try the dashboard" buttons appear only when it is set. */
  demoUrl: (import.meta.env.PUBLIC_DEMO_URL || '').replace(/\/$/, ''),
  demoApiUrl: import.meta.env.PUBLIC_DEMO_API_URL || '',
  demoApiKey: import.meta.env.PUBLIC_DEMO_API_KEY || '',
  /** Previews and forks set this so search engines never index them. */
  noindex: import.meta.env.PUBLIC_NOINDEX === 'true',
} as const;

/** A link to a file in the repository, so pages can point at guides until WEB-12 moves them here. */
export const repoFile = (path: string) => `${SITE.github}/blob/master/${path}`;

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** The header links. GitHub is shown separately, as an icon. */
export const NAV: NavLink[] = [
  { label: 'Features', href: '/features/' },
  { label: 'Playground', href: '/playground/' },
  { label: 'Compare', href: '/compare/' },
  { label: 'Pricing', href: '/pricing/' },
  { label: 'Docs', href: '/docs/' },
  { label: 'Blog', href: '/blog/' },
];

export const FOOTER: { title: string; links: NavLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features/' },
      { label: 'Playground', href: '/playground/' },
      { label: 'Compare', href: '/compare/' },
      { label: 'Pricing', href: '/pricing/' },
      { label: 'Changelog', href: '/changelog/' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs/' },
      { label: 'Blog', href: '/blog/' },
      { label: 'Releases', href: SITE.releases, external: true },
      { label: 'GitHub', href: SITE.github, external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/legal/privacy/' },
      { label: 'Terms', href: '/legal/terms/' },
      { label: 'Licences', href: '/legal/licences/' },
    ],
  },
];
