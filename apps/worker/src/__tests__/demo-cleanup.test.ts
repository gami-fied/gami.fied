import { createDemoWorkspace, db, organizations, runMigrations, users } from '@gami/database';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanUpExpiredDemos, startDemoCleanup, stopDemoCleanup } from '../demo-cleanup.js';

describe('demo cleanup', () => {
  const owners: string[] = [];

  const visitor = async () => {
    const id = `usr_cleanup_${Date.now()}_${owners.length}`;
    await db.insert(users).values({ id, name: 'Visitor', email: `${id}@demo.invalid`, emailVerified: true });
    owners.push(id);
    return id;
  };

  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await stopDemoCleanup();
    delete process.env['GAMI_DEMO_MODE'];
    if (owners.length) await db.delete(users).where(inArray(users.id, owners));
  });

  it('does not run on an instance without demos', async () => {
    delete process.env['GAMI_DEMO_MODE'];
    expect(startDemoCleanup()).toBe(false);
  });

  it('runs on a demo instance', async () => {
    process.env['GAMI_DEMO_MODE'] = 'true';
    expect(startDemoCleanup()).toBe(true);
    // Already running: a second start does nothing.
    expect(startDemoCleanup()).toBe(false);
    await stopDemoCleanup();
  });

  it('deletes every expired demo in one pass, and keeps live ones', async () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const expired = [];
    for (let i = 0; i < 3; i++) expired.push(await createDemoWorkspace({ ownerUserId: await visitor(), ttlHours: 1, now, seed: 100 + i }));
    const live = await createDemoWorkspace({ ownerUserId: await visitor(), ttlHours: 48, now, seed: 200 });

    const removed = await cleanUpExpiredDemos(new Date('2026-11-12T14:00:00Z'));
    expect(removed).toBeGreaterThanOrEqual(3);

    const left = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.id, [...expired.map((d) => d.organizationId), live.organizationId]));
    expect(left.map((row) => row.id)).toEqual([live.organizationId]);

    // The live demo's owner keeps their account; the others are gone.
    const remaining = await db.select({ id: users.id }).from(users).where(inArray(users.id, owners));
    expect(remaining.map((row) => row.id)).toEqual([owners[3]]);

    await db.update(organizations).set({ demoExpiresAt: new Date(0) }).where(eq(organizations.id, live.organizationId));
    await cleanUpExpiredDemos();
  });
});
