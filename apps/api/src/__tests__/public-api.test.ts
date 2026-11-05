import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Gami } from '@gami.fied/sdk';
import {
  db,
  endUsers,
  member,
  organizations,
  projects,
  rules,
  runMigrations,
  userXpBalances,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processEventJob } from '../../../worker/src/processor.js';
import { buildServer } from '../index.js';
import { buildOpenApiDocument } from '../public/openapi.js';
import { PUBLIC_ROUTES } from '../public/routes.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Public API', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let fullKey: string;
  let eventsOnlyKey: string;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_pub_${suffix}`;
  const projectId = `prj_pub_${suffix}`;
  const otherProjectId = `prj_pub_other_${suffix}`;
  const userId = `usr_pub_${suffix}`;
  const externalId = `customer_${suffix}`;

  const call = (method: 'GET' | 'POST', url: string, key?: string, payload?: object) =>
    app.inject({ method, url, headers: key ? { 'x-api-key': key } : {}, payload });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Public', slug: `pub-${suffix}` });
    await db.insert(projects).values([
      { id: projectId, organizationId: orgId, name: 'Public', slug: 'public' },
      { id: otherProjectId, organizationId: orgId, name: 'Other', slug: 'other' },
    ]);
    await db.insert(endUsers).values([
      { id: userId, projectId, externalId },
      { id: `usr_other_${suffix}`, projectId: otherProjectId, externalId },
    ]);
    await db.insert(userXpBalances).values({
      id: `xpb_${suffix}`,
      projectId,
      userId,
      totalXp: 75,
    });

    fullKey = (await createApiKey(projectId, 'Full', ['*'])).rawSecret;
    eventsOnlyKey = (await createApiKey(projectId, 'Events', ['events:write'])).rawSecret;

    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `pub_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Public',
      },
    });
    cookie = signUp.headers['set-cookie'] as string;
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: JSON.parse(signUp.payload).user.id,
      role: 'owner',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('/v1 routes', () => {
    it('works out the project from the key', async () => {
      const res = await call('GET', `/v1/users/${userId}/xp`, fullKey);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).totalXp).toBe(75);
    });

    it('accepts the customer ID on user routes', async () => {
      const res = await call('GET', `/v1/users/${externalId}/xp`, fullKey);
      expect(JSON.parse(res.payload).totalXp).toBe(75);
    });

    it('keeps query strings', async () => {
      const res = await call('GET', '/v1/leaderboard?limit=1', fullKey);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).limit).toBe(1);
    });

    it('still applies scopes', async () => {
      const res = await call('GET', `/v1/users/${userId}/xp`, eventsOnlyKey);
      expect(res.statusCode).toBe(403);
    });

    it('needs a key', async () => {
      const res = await call('GET', '/v1/users');
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error.code).toBe('UNAUTHORIZED');
    });

    it('only maps to routes that exist', () => {
      for (const route of PUBLIC_ROUTES) {
        const url = `/api/projects/:projectId${route.path}`;
        expect(app.hasRoute({ method: route.method, url }), url).toBe(true);
      }
    });

    it('works through the SDK with no project ID', async () => {
      const gami = new Gami({
        apiKey: fullKey,
        baseUrl: 'http://gami.test',
        retry: { maxRetries: 0 },
      });
      const realFetch = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        const target = new URL(url);
        const res = await app.inject({
          method: init.method as 'GET',
          url: `${target.pathname}${target.search}`,
          headers: init.headers as Record<string, string>,
        });
        return new Response(res.payload, { status: res.statusCode });
      }) as typeof fetch;

      try {
        await expect(gami.xp.getBalance({ userId: externalId })).resolves.toMatchObject({
          totalXp: 75,
        });
      } finally {
        global.fetch = realFetch;
      }
    });
  });

  describe('errors', () => {
    it.each([
      ['a route that sends a plain string', '/api/projects/missing/users/x/xp'],
      ['an unknown route', '/nothing-here'],
    ])('uses one shape for %s', async (_label, url) => {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      const body = JSON.parse(res.payload);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(body.error).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        requestId: expect.any(String),
      });
      expect(body.message).toBe(body.error.message);
      expect(body.code).toBe(body.error.code);
    });
  });

  describe('batch ingestion', () => {
    it('reports each event alone', async () => {
      const off = `off_${suffix}`;
      await db.insert(endUsers).values({
        id: `usr_off_${suffix}`,
        projectId,
        externalId: off,
        active: false,
      });

      const res = await call('POST', '/v1/events/batch', fullKey, {
        events: [
          { event: 'batch_ok', user_id: externalId },
          { event: 'batch_blocked', user_id: off },
        ],
      });

      expect(res.statusCode).toBe(207);
      const body = JSON.parse(res.payload);
      expect(body).toMatchObject({ accepted: 1, rejected: 1 });
      expect(body.results[0].status).toBe('accepted');
      expect(body.results[1]).toMatchObject({ status: 'rejected', code: 'USER_DEACTIVATED' });
    });

    it('refuses more than 100 events', async () => {
      const events = Array.from({ length: 101 }, () => ({ event: 'x' }));
      const res = await call('POST', '/v1/events/batch', fullKey, { events });
      expect(res.statusCode).toBe(400);
    });

    it('needs events:write', async () => {
      const key = (await createApiKey(projectId, 'Read', ['users:read'])).rawSecret;
      const res = await call('POST', '/v1/events/batch', key, { events: [{ event: 'x' }] });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('waiting for rewards', () => {
    const makeRule = async (type: string) => {
      await db.insert(rules).values({
        id: `rule_${type}`,
        projectId,
        name: 'Wait',
        trigger: type,
        actions: [{ type: 'award_xp', params: { amount: 25 } }],
      });
    };

    it('returns what the worker awarded', async () => {
      const type = `wait_${suffix}`;
      await makeRule(type);
      const payload = { event: type, user_id: externalId, idempotency_key: `key_${suffix}` };

      const sent = await call('POST', '/v1/events', fullKey, payload);
      await processEventJob(JSON.parse(sent.payload).id);

      // The same key returns the same event, which has now been processed.
      const res = await call('POST', '/v1/events?wait=true', fullKey, payload);
      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.payload).rewards).toMatchObject({
        evaluated: true,
        xpAwarded: 25,
        totalXp: 100,
      });
    });

    it('says so when the worker has not finished in time', async () => {
      const type = `wait_late_${suffix}`;
      await makeRule(type);

      const res = await call('POST', '/v1/events?wait=true', fullKey, {
        event: type,
        user_id: externalId,
      });

      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.payload).rewards).toMatchObject({ evaluated: false, xpAwarded: 0 });
    });
  });

  describe('end-user tokens', () => {
    const token = async (id = externalId) => {
      const res = await call('POST', '/v1/end-user-tokens', fullKey, { userId: id });
      expect(res.statusCode).toBe(201);
      return JSON.parse(res.payload).token as string;
    };

    const asUser = (url: string, value: string, origin?: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${value}`, ...(origin ? { origin } : {}) },
      });

    it('lets one user read their own data', async () => {
      const res = await asUser('/v1/me', await token());
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toMatchObject({ externalId });
    });

    it('rejects a changed token', async () => {
      const value = await token();
      const res = await asUser('/v1/me', `${value.slice(0, -2)}xx`);
      expect(res.statusCode).toBe(401);
    });

    it('cannot be used as an API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/users',
        headers: { 'x-api-key': await token() },
      });
      expect(res.statusCode).toBe(401);
    });

    it('needs users:write to create', async () => {
      const res = await call('POST', '/v1/end-user-tokens', eventsOnlyKey, { userId: externalId });
      expect(res.statusCode).toBe(403);
    });

    it('applies the project allowlist', async () => {
      const update = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}`,
        headers: { cookie },
        payload: { allowedOrigins: ['https://app.customer.com'] },
      });
      expect(update.statusCode).toBe(200);

      const value = await token();
      expect((await asUser('/v1/me', value, 'https://evil.example')).statusCode).toBe(403);
      expect((await asUser('/v1/me', value, 'https://app.customer.com')).statusCode).toBe(200);

      await db.update(projects).set({ allowedOrigins: [] }).where(eq(projects.id, projectId));
    });

    it('answers a browser preflight from any site', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me',
        headers: {
          origin: 'https://app.customer.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });
      expect(res.headers['access-control-allow-origin']).toBe('https://app.customer.com');
    });

    it('rejects a bad origin value on the project', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}`,
        headers: { cookie },
        payload: { allowedOrigins: ['https://app.customer.com/path'] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('OpenAPI', () => {
    it('is in step with the route table', () => {
      const file = path.resolve(import.meta.dirname, '../../../../docs/openapi.json');
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(stored).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
    });
  });
});
