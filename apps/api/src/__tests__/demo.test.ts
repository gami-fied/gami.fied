import { randomUUID } from 'crypto';
import { db, deleteAllDemos, eventOutbox, events, organizations, users } from '@gami/database';
import { getSmtpProviderFromConfig } from '@gami/notifications';
import { getRedisConnection } from '@gami/queue';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../index.js';

// Demo settings are read when the server is built. Only these variables change, and each is put
// back afterwards, because test files can share a process and demo mode turns all email off.
const DEMO_ENV = {
  GAMI_DEMO_MODE: 'true',
  GAMI_DEMO_STARTS_PER_HOUR: '2',
  GAMI_DEMO_MAX_LIVE: '50',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: 'test-secret',
};
const TOUCHED = [...Object.keys(DEMO_ENV), 'SMTP_HOST', 'SMTP_FROM_EMAIL'];
const saved = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
const restoreEnv = () => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
};

describe('live demos', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  // Cloudflare is never called: its answer is stubbed per test.
  const turnstile = (success: boolean) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('challenges.cloudflare.com')) return new Response(JSON.stringify({ success }), { headers: { 'content-type': 'application/json' } });
      throw new Error(`Unexpected request to ${String(input)}`);
    });
  const start = (remoteAddress: string, token: string | undefined = 'token') =>
    app.inject({ method: 'POST', url: '/api/demo/start', remoteAddress, payload: token ? { turnstileToken: token } : {} });

  beforeAll(async () => {
    Object.assign(process.env, DEMO_ENV);
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await deleteAllDemos();
    await app.close();
    restoreEnv();
  });

  it('says whether demos are offered, with the challenge site key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/demo' });
    expect(JSON.parse(res.payload)).toEqual({ enabled: true, ttlHours: 24, turnstileSiteKey: '1x00000000000000000000AA' });
  });

  it('starts a demo, signs the visitor in, and locks the demo down', async () => {
    turnstile(true);
    const res = await start(ip());
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.players).toBeGreaterThan(20);
    expect(body.events).toBeGreaterThan(300);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23.9 * 3_600_000);

    const cookie = res.headers['set-cookie'] as string | string[];
    expect(cookie).toBeTruthy();
    const headers = { cookie: ([] as string[]).concat(cookie).map((c) => c.split(';')[0]).join('; ') };

    // Signed in as the demo's only member, with a verified address nobody receives mail at.
    const orgs = JSON.parse((await app.inject({ method: 'GET', url: '/api/organizations', headers })).payload);
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ id: body.organizationId, role: 'owner' });
    expect(orgs[0].demoExpiresAt).toBe(body.expiresAt);
    const session = JSON.parse((await app.inject({ method: 'GET', url: '/api/auth/get-session', headers })).payload);
    expect(session.user.email).toMatch(/@demo\.invalid$/);
    const [account] = await db.select().from(users).where(eq(users.id, session.user.id));
    expect(account?.emailVerified).toBe(true);

    // Locked down: webhooks are off, and a second project is refused.
    const features = JSON.parse((await app.inject({ method: 'GET', url: `/api/projects/${body.projectId}/features`, headers })).payload);
    for (const key of ['webhooks', 'integrations', 'connectors', 'campaigns', 'push', 'plugins']) expect(features.features[key]).toBe(false);
    expect(features.features.leagues).toBe(true);
    const hook = await app.inject({ method: 'POST', url: `/api/projects/${body.projectId}/webhooks`, headers, payload: { url: 'https://example.com/hook', events: ['xp.awarded'] } });
    expect(hook.statusCode).toBeGreaterThanOrEqual(400);
    const second = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { organizationId: body.organizationId, name: 'Second', slug: `second-${randomUUID().slice(0, 6)}` } });
    expect(second.statusCode).toBeGreaterThanOrEqual(400);

    // Send traffic adds events for real players, and cools down between bursts.
    const traffic = await app.inject({ method: 'POST', url: '/api/demo/traffic', headers });
    expect(traffic.statusCode).toBe(200);
    expect(JSON.parse(traffic.payload).sent).toBe(12);
    const live = await db.select({ id: events.id }).from(events).where(eq(events.projectId, body.projectId));
    expect(live.length).toBe(body.events + 12);
    const again = await app.inject({ method: 'POST', url: '/api/demo/traffic', headers });
    expect(again.statusCode).toBe(429);
    vi.restoreAllMocks();
  });

  it('refuses a start that fails the challenge, without creating anything', async () => {
    turnstile(false);
    const before = await db.select({ id: organizations.id }).from(organizations);
    const res = await start(ip());
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).code).toBe('DEMO_CHALLENGE_FAILED');
    expect(await db.select({ id: organizations.id }).from(organizations)).toHaveLength(before.length);
    expect((await start(ip(), undefined)).statusCode).toBe(403);
    vi.restoreAllMocks();
  });

  it('limits starts per address', async () => {
    turnstile(true);
    const address = ip();
    try {
      expect((await start(address)).statusCode).toBe(201);
      expect((await start(address)).statusCode).toBe(201);
      const third = await start(address);
      expect(third.statusCode).toBe(429);
      expect(JSON.parse(third.payload).code).toBe('DEMO_RATE_LIMITED');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('needs a live demo to send traffic', async () => {
    const signUp = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `plain_${randomUUID()}@example.com`, password: 'Password123!', name: 'Plain' } });
    const cookie = signUp.headers['set-cookie'] as string;
    const res = await app.inject({ method: 'POST', url: '/api/demo/traffic', headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it('sends no email on a demo instance, whatever SMTP says', () => {
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_FROM_EMAIL'] = 'demo@example.com';
    expect(getSmtpProviderFromConfig()).toBeNull();
    expect(getSmtpProviderFromConfig({ host: 'smtp.example.com', port: 587, fromEmail: 'x@example.com' } as never)).toBeNull();
  });

  it('queues every seeded event for the worker', async () => {
    turnstile(true);
    const res = await start(ip());
    vi.restoreAllMocks();
    const body = JSON.parse(res.payload);
    const rows = await db.select({ status: eventOutbox.status }).from(eventOutbox).innerJoin(events, eq(events.id, eventOutbox.eventId)).where(eq(events.projectId, body.projectId));
    expect(rows).toHaveLength(body.events);
    // Keys for rate limits are hashed, so no address is stored as it is.
    const keys = await getRedisConnection().keys('demo:starts:*');
    expect(keys.every((key) => !/\d+\.\d+\.\d+\.\d+/.test(key))).toBe(true);
  });
});
