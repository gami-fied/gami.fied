import { OGImageRoute } from 'astro-og-canvas';
import { OG_PAGES } from '../../lib/og';

// The brand fonts come from the installed @fontsource packages, so the images match the site.
const fonts = [
  './node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff',
  './node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff',
];

/** Builds a 1200×630 social card for every entry in OG_PAGES at build time. */
export const { getStaticPaths, GET } = await OGImageRoute({
  pages: OG_PAGES,
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
