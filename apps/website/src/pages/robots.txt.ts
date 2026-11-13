import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

/** Lets search engines in on the live site, and keeps previews and forks out. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site ?? SITE.url).href;
  const body = SITE.noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
