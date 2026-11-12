import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts show only in development. */
export async function publishedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', (post) => import.meta.env.DEV || !post.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
