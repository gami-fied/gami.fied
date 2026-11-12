// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import repoDocs from './src/integrations/repo-docs.mjs';

// Set per deployment, so previews and forks need no code changes. See .env.example.
const site = process.env.PUBLIC_SITE_URL || 'https://gami.fied.cc';
const repository = 'https://github.com/gami-fied/gami.fied';
const docsImage = new URL('/og/docs.png', site).href;

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    // Copies the repository's docs/ folder into Starlight before it reads its content.
    repoDocs({ repository }),
    // Starlight serves the docs under /docs and builds the sitemap for the whole site.
    starlight({
      title: 'Gami.Fied',
      description: 'Docs for Gami.Fied, the self-hosted, open-source gamification engine.',
      // The same mark as the site and the dashboard, from packages/ui.
      logo: { src: '../../packages/ui/brand/mark.svg', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: repository }],
      // Each page from docs/ sets its own edit link to its source file.
      editLink: { baseUrl: `${repository}/edit/master/` },
      lastUpdated: false,
      // The marketing 404 page covers the whole site.
      disable404Route: true,
      customCss: [
        '@fontsource/space-grotesk/400.css',
        '@fontsource/space-grotesk/500.css',
        '@fontsource/space-grotesk/700.css',
        '@fontsource/space-mono/400.css',
        './src/styles/docs.css',
      ],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: docsImage } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: docsImage } },
        ...(process.env.PUBLIC_NOINDEX === 'true'
          ? [{ tag: /** @type {const} */ ('meta'), attrs: { name: 'robots', content: 'noindex, nofollow' } }]
          : []),
      ],
      plugins: [
        starlightOpenAPI([
          {
            base: 'docs/api',
            schema: '../../docs/openapi.json',
            sidebar: { label: 'Endpoints', collapsed: true, operations: { badges: true } },
          },
        ]),
      ],
      // Grouped by what the reader is trying to do.
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs' },
            { label: 'Run it locally', slug: 'docs/getting-started' },
            {
              label: 'Quickstarts',
              items: [
                { label: 'REST and cURL', slug: 'docs/quickstarts/rest' },
                { label: 'Node.js', slug: 'docs/quickstarts/node' },
                { label: 'Python', slug: 'docs/quickstarts/python' },
                { label: 'Next.js', slug: 'docs/quickstarts/nextjs' },
                { label: 'React', slug: 'docs/quickstarts/react' },
              ],
            },
          ],
        },
        {
          label: 'Install',
          items: [
            { label: 'Docker Compose', slug: 'docs/install/docker-compose' },
            { label: 'Reverse proxy and HTTPS', slug: 'docs/install/reverse-proxy' },
            { label: 'Upgrading', slug: 'docs/install/upgrading' },
            { label: 'Backups', slug: 'docs/backups' },
            { label: 'Production checklist', slug: 'docs/install/production-checklist' },
            { label: 'Deployment reference', slug: 'docs/deployment-and-production' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture', slug: 'docs/architecture' },
            { label: 'Events, rules and progression', slug: 'docs/gamification-mechanics' },
            { label: 'Economy and store', slug: 'docs/economy-and-store' },
            { label: 'Segments, leagues and social', slug: 'docs/social-and-competition' },
            { label: 'Community Edition', slug: 'docs/community-edition' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'TypeScript SDK', slug: 'docs/sdk' },
            { label: 'React components', slug: 'docs/react' },
            { label: 'Notifications and webhooks', slug: 'docs/notifications-and-integrations' },
            { label: 'Connectors and plugins', slug: 'docs/connectors-environments-and-plugins' },
            { label: 'Analytics', slug: 'docs/analytics' },
            { label: 'Importing data', slug: 'docs/data-import' },
            { label: 'Exporting data', slug: 'docs/data-export' },
            { label: 'Platform administration', slug: 'docs/platform-administration' },
            { label: 'Features and organization rules', slug: 'docs/platform-administration-features' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API overview', slug: 'docs/api-reference' },
            { label: 'Try the API', link: '/docs/api-explorer/' },
            { label: 'Authentication', slug: 'docs/api-authentication' },
            { label: 'Errors', slug: 'docs/api-errors' },
            { label: 'Idempotency', slug: 'docs/idempotency' },
            { label: 'Request IDs', slug: 'docs/request-ids' },
            { label: 'Versioning', slug: 'docs/api-versioning' },
            { label: 'Route permissions', slug: 'docs/permissions' },
            ...openAPISidebarGroups,
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Monitoring and runbook', slug: 'docs/operations' },
            { label: 'Performance', slug: 'docs/performance' },
            { label: 'Authentication and security', slug: 'docs/authentication-and-security' },
            { label: 'Data retention', slug: 'docs/data-retention' },
            { label: 'Disaster recovery', slug: 'docs/disaster-recovery' },
            { label: 'Running a live demo', slug: 'docs/live-demo' },
            { label: 'Security status', slug: 'docs/security-audit' },
            { label: 'Release checklist', slug: 'docs/release-checklist' },
          ],
        },
      ],
    }),
    react(),
    // Blog posts can be written in MDX.
    mdx(),
  ],
  // Code samples on marketing pages use the same theme as the docs.
  markdown: { shikiConfig: { theme: 'github-dark' } },
  vite: {
    plugins: [tailwindcss()],
  },
});
