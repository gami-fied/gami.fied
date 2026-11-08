import { generateKeyPairSync, randomUUID } from 'crypto';
import { db, endUsers, member, organizations, projectMembers, projects, pushDevices, runMigrations } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('chat and push integrations', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_pi_${suffix}`;
  const projectId = `prj_pi_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const connect = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `${base}/integrations`, headers: { cookie }, payload: { name: 'Test', ...payload } });

  const tokenFor = async (userId: string) =>
    JSON.parse((await app.inject({ method: 'POST', url: '/v1/end-user-tokens', headers: { 'x-api-key': apiKey }, payload: { userId } })).payload).token as string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'PI', slug: `pi-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'PI', slug: 'pi' });
    apiKey = (await createApiKey(projectId, 'Server', ['users:write'])).rawSecret;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `pi_${randomUUID()}@example.com`, password: 'Password123!', name: 'PI' },
    });
    cookie = res.headers['set-cookie'] as string;
    const userId = JSON.parse(res.payload).user.id as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId, role: 'owner', createdAt: new Date() });
    void projectMembers;
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('Slack, Teams and plain webhooks', () => {
    it('connects Slack with a real-looking address, and never shows it back', async () => {
      const url = 'https://hooks.slack.com/services/T000/B000/secretsecretsecret';
      const res = await connect({ provider: 'slack', webhookUrl: url });
      expect(res.statusCode).toBe(201);
      expect(res.payload).not.toContain('secretsecretsecret');
      expect(JSON.parse(res.payload).integration).toMatchObject({ provider: 'slack', config: { configured: true } });
    });

    it('connects Teams, and keeps the chosen events', async () => {
      const res = await connect({ provider: 'teams', webhookUrl: 'https://contoso.webhook.office.com/webhookb2/abc', enabledEvents: ['level_up'] });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).integration.config.enabledEvents).toEqual(['level_up']);
    });

    it('rejects an address that is not the service it was chosen for', async () => {
      const res = await connect({ provider: 'slack', webhookUrl: 'https://example.com/hook' });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain('slack webhook URL');
    });

    it('rejects an unknown provider, naming the ones that work', async () => {
      const res = await connect({ provider: 'carrier-pigeon', webhookUrl: 'https://example.com/hook' });
      expect(res.statusCode).toBe(400);
      const message = JSON.parse(res.payload).message as string;
      for (const provider of ['discord', 'slack', 'teams', 'http', 'fcm', 'apns']) expect(message).toContain(provider);
    });

    it('requires an address', async () => {
      expect((await connect({ provider: 'teams' })).statusCode).toBe(400);
    });

    it('records that a generic webhook is signed, without showing the secret', async () => {
      const res = await connect({ provider: 'http', webhookUrl: 'https://example.com/hooks/gami', signingSecret: 'a-long-signing-secret' });
      expect(res.statusCode).toBe(201);
      expect(res.payload).not.toContain('a-long-signing-secret');
      expect(JSON.parse(res.payload).integration.config.signed).toBe(true);
    });

    it('refuses a generic webhook pointing at a private address', async () => {
      const res = await connect({ provider: 'http', webhookUrl: 'https://127.0.0.1/hook' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('push providers', () => {
    const appleKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    it('connects Apple push, keeping the key secret and recording sandbox mode', async () => {
      const res = await connect({
        provider: 'apns',
        credentials: { privateKey: appleKey, keyId: 'ABC123DEFG', teamId: 'TEAM123456', topic: 'com.acme.app' },
        sandbox: true,
      });
      expect(res.statusCode).toBe(201);
      expect(res.payload).not.toContain('PRIVATE KEY');
      expect(JSON.parse(res.payload).integration.config).toMatchObject({ configured: true, sandbox: true });
    });

    it('connects Firebase push from a service account file', async () => {
      const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const res = await connect({
        provider: 'fcm',
        credentials: JSON.stringify({ client_email: 'push@acme.iam.gserviceaccount.com', private_key: privateKey, project_id: 'acme' }),
      });
      expect(res.statusCode).toBe(201);
      expect(res.payload).not.toContain('PRIVATE KEY');
    });

    it('rejects credentials that are not usable, and missing ones', async () => {
      expect((await connect({ provider: 'fcm', credentials: '{"nope":true}' })).statusCode).toBe(400);
      expect((await connect({ provider: 'apns', credentials: { keyId: 'x' } })).statusCode).toBe(400);
      expect((await connect({ provider: 'apns' })).statusCode).toBe(400);
    });

    it('tests a connection without needing a phone', async () => {
      const created = JSON.parse(
        (await connect({ provider: 'apns', credentials: { privateKey: appleKey, keyId: 'ABC123DEFG', teamId: 'TEAM123456', topic: 'com.acme.app' } })).payload
      );
      const res = await app.inject({ method: 'POST', url: `${base}/integrations/${created.integration.id}/test`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('registering phones', () => {
    const userId = `usr_phone_${suffix}`;
    const otherId = `usr_other_${suffix}`;
    const token = `fcm-token-${randomUUID()}-padding-to-length`;

    beforeAll(async () => {
      await db.insert(endUsers).values([
        { id: userId, projectId, externalId: `phone_${suffix}` },
        { id: otherId, projectId, externalId: `other_${suffix}` },
      ]);
    });

    const register = async (forUser: string, payload: unknown) =>
      app.inject({ method: 'POST', url: '/v1/me/devices', headers: { authorization: `Bearer ${await tokenFor(forUser)}` }, payload: payload as object });

    it('needs a token and a platform', async () => {
      expect((await register(userId, { token: 'short', platform: 'android' })).statusCode).toBe(400);
      expect((await register(userId, { token, platform: 'blackberry' })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/v1/me/devices', payload: { token, platform: 'ios' } })).statusCode).toBe(401);
    });

    it('registers a phone once, however often the app reports it', async () => {
      expect((await register(userId, { token, platform: 'android' })).statusCode).toBe(201);
      expect((await register(userId, { token, platform: 'android' })).statusCode).toBe(201);
      const rows = await db.select().from(pushDevices).where(eq(pushDevices.token, token));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId, platform: 'android', active: true });
    });

    it('moves a phone to the player who signs in on it next', async () => {
      await register(otherId, { token, platform: 'android' });
      const [row] = await db.select().from(pushDevices).where(eq(pushDevices.token, token));
      expect(row!.userId).toBe(otherId);
    });

    it("lets a player remove only their own phone", async () => {
      const mine = await app.inject({
        method: 'DELETE',
        url: `/v1/me/devices/${encodeURIComponent(token)}`,
        headers: { authorization: `Bearer ${await tokenFor(userId)}` },
      });
      expect(mine.statusCode).toBe(200);
      expect(await db.select().from(pushDevices).where(eq(pushDevices.token, token))).toHaveLength(1); // not theirs

      await app.inject({
        method: 'DELETE',
        url: `/v1/me/devices/${encodeURIComponent(token)}`,
        headers: { authorization: `Bearer ${await tokenFor(otherId)}` },
      });
      expect(await db.select().from(pushDevices).where(and(eq(pushDevices.token, token)))).toHaveLength(0);
    });
  });
});
