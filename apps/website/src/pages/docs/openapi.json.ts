/**
 * The OpenAPI document from the repository, served for the API explorer and anyone who wants it.
 * When a demo instance is configured, it is listed as the server so "try it" sends requests there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';
import { SITE } from '../../lib/site';

export const GET: APIRoute = () => {
  const spec = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/openapi.json'), 'utf8'));
  if (SITE.demoApiUrl) spec.servers = [{ url: SITE.demoApiUrl, description: 'The public demo instance' }];
  return new Response(JSON.stringify(spec), { headers: { 'Content-Type': 'application/json' } });
};
