import { randomUUID } from 'crypto';
import { runMigrations } from '@gami/database';
import { Gami } from '@gami/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('@gami/sdk - Live API Integration Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let projId: string;
  let apiKeySecret: string;
  let gami: Gami;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // 1. Sign up Dashboard User
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `sdk_live_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'SDK Live Test Admin',
      },
    });

    const cookie = signupRes.headers['set-cookie'] as string;

    // 2. Create Org & Project
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie },
      payload: { name: 'SDK Live Org', slug: `org-${randomUUID()}` },
    });
    const org = JSON.parse(orgRes.payload);

    const prjRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie },
      payload: {
        organizationId: org.id,
        name: 'SDK Live Project',
        slug: `prj-${randomUUID()}`,
      },
    });
    const prj = JSON.parse(prjRes.payload);
    projId = prj.id;

    // 3. Generate API Key
    const keyData = await createApiKey(projId, 'SDK Live Integration Key');
    apiKeySecret = keyData.rawSecret;

    // 4. Instantiate Gami SDK client against live Fastify server
    gami = new Gami({
      apiKey: apiKeySecret,
      baseUrl,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. tracks event live via gami.events.track()', async () => {
    const res = await gami.events.track({
      projectId: projId,
      userId: 'usr_sdk_test_1',
      type: 'purchase_completed',
      properties: {
        amount: 149.99,
        tier: 'gold',
      },
    });

    expect((res as unknown as { id: string }).id).toBeDefined();
    expect(res.status).toBe('accepted');
  });

  it('2. checks XP balance via gami.xp.getBalance()', async () => {
    const balance = await gami.xp.getBalance({
      projectId: projId,
      userId: 'usr_sdk_test_1',
    });

    expect(balance.projectId).toBe(projId);
    expect(balance.userId).toBe('usr_sdk_test_1');
    expect(balance.totalXp).toBe(0);
  });

  it('3. checks levels list via gami.levels.list()', async () => {
    const levels = await gami.levels.list({
      projectId: projId,
    });

    expect(Array.isArray(levels)).toBe(true);
  });

  it('4. checks achievements list via gami.achievements.list()', async () => {
    const achievements = await gami.achievements.list({
      projectId: projId,
    });

    expect(Array.isArray(achievements)).toBe(true);
  });
});
