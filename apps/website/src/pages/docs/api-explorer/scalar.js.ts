/**
 * Scalar's viewer, served from this site instead of a public CDN, so the explorer makes no
 * requests to anyone else.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(readFileSync(resolve(process.cwd(), 'node_modules/@scalar/api-reference/dist/browser/standalone.js')), {
    headers: { 'Content-Type': 'text/javascript' },
  });
