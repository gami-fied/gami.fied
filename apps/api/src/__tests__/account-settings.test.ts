import { randomUUID } from 'crypto';
import { db, member, organizations, runMigrations, serverConfigs, users } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { ServerConfigService } from '../services/server-config.service.js';

describe('Accounts and saved settings', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_acc_${suffix}`;

  const signUp = async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `acc_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Account',
      },
    });
    return {
      id: JSON.parse(res.payload).user.id as string,
      cookie: res.headers['set-cookie'] as string,
    };
  };

  const deleteAccount = (cookie: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/delete-user',
      headers: { cookie, origin: 'http://localhost:3000' },
      payload: { password: 'Password123!' },
    });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'Account', slug: `acc-${suffix}` });
  });

  afterAll(async () => {
    await db.delete(serverConfigs).where(eq(serverConfigs.key, 'webhooks_config'));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('shows the platform admin flag in the session, and refuses it at sign-up', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `acc_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Sneaky',
        isPlatformAdmin: true,
      },
    });

    const body = JSON.parse(res.payload);
    if (res.statusCode === 200) {
      const [created] = await db
        .select({ isPlatformAdmin: users.isPlatformAdmin })
        .from(users)
        .where(eq(users.id, body.user.id));
      expect(created?.isPlatformAdmin).toBe(false);
    } else {
      expect(res.statusCode).toBe(400);
    }

    const { cookie } = await signUp();
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(JSON.parse(session.payload).user.isPlatformAdmin).toBe(false);
  });

  it('lets a user delete their account', async () => {
    const { id, cookie } = await signUp();
    expect((await deleteAccount(cookie)).statusCode).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
  });

  it('refuses while the user owns an organization', async () => {
    const { id, cookie } = await signUp();
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: id,
      role: 'owner',
      createdAt: new Date(),
    });

    const res = await deleteAccount(cookie);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('Transfer or delete');
    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(1);
  });

  it('keeps other settings on a partial save', async () => {
    await ServerConfigService.setConfig('webhooks', { maxWebhooksPerProject: 7 });
    await ServerConfigService.setConfig('webhooks', { defaultTimeoutMs: 2000 });

    const saved = await ServerConfigService.getConfig<Record<string, unknown>>('webhooks');
    expect(saved).toMatchObject({ maxWebhooksPerProject: 7, defaultTimeoutMs: 2000 });
  });
});
