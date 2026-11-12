import { OGImageRoute } from 'astro-og-canvas';
import { publishedPosts } from '../../lib/blog';
import { OG_PAGES, type OgPage } from '../../lib/og';

// The brand fonts come from the installed @fontsource packages, so the images match the site.
const fonts = [
  './node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff',
  './node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff',
];

/** Builds a 1200×630 social card for every entry in OG_PAGES at build time. */
// Every blog post gets its own card, from its title and description.
const posts = await publishedPosts();
const pages: Record<string, OgPage> = {
  ...OG_PAGES,
  ...Object.fromEntries(posts.map((post) => [`blog/${post.id}`, { title: post.data.title, description: post.data.description }])),
};

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    logo: { path: './src/assets/mark.png', size: [88] },
    bgGradient: [
      [9, 9, 11],
      [24, 24, 27],
    ],
    border: { color: [249, 115, 22], width: 14, side: 'inline-start' },
    padding: 80,
    fonts,
    font: {
      title: { families: ['Space Grotesk'], weight: 'Bold', size: 76, lineHeight: 1.1, color: [250, 250, 250] },
      description: { families: ['Space Grotesk'], weight: 'Medium', size: 34, lineHeight: 1.4, color: [161, 161, 170] },
    },
  }),
});
