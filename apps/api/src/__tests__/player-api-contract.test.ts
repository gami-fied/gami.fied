/**
 * Every `/v1/me` route must be reachable from a browser, documented and in the SDK (SUG-11).
 * The routes are read from the server itself, so a new one fails here until all three are done.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer, registeredRoutes } from '../index.js';
import { buildOpenApiDocument } from '../public/openapi.js';

const sdkDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/sdk/src'
);

describe('the player API contract', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let routes: { method: string; url: string }[];

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    const seen = new Set<string>();
    routes = registeredRoutes.filter(({ method, url }) => {
      const key = `${method} ${url}`;
      if (!url.startsWith('/v1/me') || method === 'HEAD' || method === 'OPTIONS' || seen.has(key))
        return false;
      seen.add(key);
      return true;
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds the player routes', () => {
    expect(routes.length).toBeGreaterThan(25);
    expect(routes.some((route) => route.method === 'POST')).toBe(true);
    expect(routes.some((route) => route.method === 'DELETE')).toBe(true);
  });

  it('lets a browser on another site send every method the routes use', async () => {
    const refused: string[] = [];
    for (const { method, url } of routes) {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: url.replace(/:\w+/g, 'x'),
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      const allowed = String(preflight.headers['access-control-allow-methods'] ?? '');
      if (preflight.statusCode !== 204 || !allowed.split(/,\s*/).includes(method))
        refused.push(`${method} ${url}`);
    }
    expect(refused).toEqual([]);
  });

  it('documents every player route', () => {
    const paths = buildOpenApiDocument().paths as Record<string, Record<string, unknown>>;
    const missing = routes
      .filter(({ method, url }) => !paths[url.replace(/:(\w+)/g, '{$1}')]?.[method.toLowerCase()])
      .map(({ method, url }) => `${method} ${url}`);
    expect(missing).toEqual([]);
  });

  it('has an SDK call for every player route', () => {
    const source = ['me.ts', 'stream.ts', 'client.ts']
      .map((file) => fs.readFileSync(path.join(sdkDir, file), 'utf8'))
      .join('\n');
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const missing = routes
      .filter(({ url }) => {
        // `/v1/me/friends/:code` is written in the SDK as `/v1/me/friends/${encodeURIComponent(code)}`.
        const pattern = url.split(/:\w+/).map(escape).join('\\$\\{[^}]+\\}');
        return !new RegExp(`['\`]${pattern}['\`?]`).test(source);
      })
      .map(({ method, url }) => `${method} ${url}`);
    expect(missing).toEqual([]);
  });
});
