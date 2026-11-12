import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { publishedPosts } from '../lib/blog';
import { SITE } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  const posts = await publishedPosts();
  return rss({
    title: `${SITE.name} blog`,
    description: 'Releases, guides on gamification design, and what is next for Gami.Fied.',
    site: site ?? SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
  });
};
