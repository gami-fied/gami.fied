// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// Set per deployment, so previews and forks need no code changes. See .env.example.
const site = process.env.PUBLIC_SITE_URL || 'https://gami.fied.cc';
const repository = 'https://github.com/gami-fied/gami.fied';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    // Starlight serves the docs under /docs and builds the sitemap for the whole site.
    starlight({
      title: 'Gami.Fied',
      description: 'Docs for Gami.Fied, the self-hosted, open-source gamification engine.',
      logo: { src: './src/assets/mark.png', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: repository }],
      editLink: { baseUrl: `${repository}/edit/master/apps/website/` },
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
        { tag: 'meta', attrs: { property: 'og:image', content: new URL('/og/docs.png', site).href } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: new URL('/og/docs.png', site).href } },
        ...(process.env.PUBLIC_NOINDEX === 'true' ? [{ tag: /** @type {const} */ ('meta'), attrs: { name: 'robots', content: 'noindex, nofollow' } }] : []),
      ],
      sidebar: [{ label: 'Start here', items: [{ label: 'Overview', slug: 'docs' }] }],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
