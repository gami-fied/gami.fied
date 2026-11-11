import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// The docs are served by Starlight under /docs. WEB-12 points this at the repository's own docs/
// folder, so the guides have one source.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
