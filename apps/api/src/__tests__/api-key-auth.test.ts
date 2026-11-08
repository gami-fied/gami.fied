import { randomUUID } from 'crypto';
import { apiKeys, db, organizations, projects, runMigrations } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticateApiKey, createApiKey } from '../services/api-key.service.js';

describe('API key authentication', () => {
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_auth_${suffix}`;
  const projectId = `prj_auth_${suffix}`;

  const lastUsed = async (id: string) =>
    (await db.select({ at: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.id, id)))[0]?.at;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

  beforeAll(async () => {
    await runMigrations();
    await db.insert(organizations).values({ id: orgId, name: 'Auth', slug: `auth-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Auth', slug: 'auth' });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('returns the key, its project and the organization state', async () => {
    const { rawSecret, id } = await createApiKey(projectId, 'Auth');
    const result = await authenticateApiKey(rawSecret);

    expect(result?.key.id).toBe(id);
    expect(result?.project.id).toBe(projectId);
    expect(result?.isSuspended).toBe(false);
  });

  it('refuses unknown, revoked and expired keys', async () => {
    expect(await authenticateApiKey('gami_live_nope')).toBeNull();
    expect(await authenticateApiKey('')).toBeNull();

    const revoked = await createApiKey(projectId, 'Revoked');
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, revoked.id));
    expect(await authenticateApiKey(revoked.rawSecret)).toBeNull();

    const expired = await createApiKey(projectId, 'Expired', ['*'], new Date(Date.now() - 1000));
    expect(await authenticateApiKey(expired.rawSecret)).toBeNull();
  });

  it('reports a suspended organization', async () => {
    const { rawSecret } = await createApiKey(projectId, 'Suspended');
    await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, orgId));
    try {
      expect((await authenticateApiKey(rawSecret))?.isSuspended).toBe(true);
    } finally {
      await db.update(organizations).set({ status: 'active' }).where(eq(organizations.id, orgId));
    }
  });

  it('records when a key was last used, but only about once a minute', async () => {
    const { rawSecret, id } = await createApiKey(projectId, 'Used');
    expect(await lastUsed(id)).toBeNull();

    await authenticateApiKey(rawSecret);
    await settle();
    const first = await lastUsed(id);
    expect(first).toBeInstanceOf(Date);

    await authenticateApiKey(rawSecret);
    await settle();
    expect((await lastUsed(id))?.getTime()).toBe(first?.getTime());
  });

  it('refreshes it once it is stale', async () => {
    const { rawSecret, id } = await createApiKey(projectId, 'Stale');
    const old = new Date(Date.now() - 5 * 60_000);
    await db.update(apiKeys).set({ lastUsedAt: old }).where(eq(apiKeys.id, id));

    await authenticateApiKey(rawSecret);
    await settle();
    expect((await lastUsed(id))!.getTime()).toBeGreaterThan(old.getTime());
  });
});
