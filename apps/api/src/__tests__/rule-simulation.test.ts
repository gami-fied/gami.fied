import { randomUUID } from 'crypto';
import { db, endUsers, events, member, organizations, projects, runMigrations, xpLedger } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('rule backtests', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_sim_${suffix}`;
  const projectId = `prj_sim_${suffix}`;

  const simulate = async (payload: unknown) => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/rules/simulate`, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: JSON.parse(res.payload) };
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'Sim', slug: `sim-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Sim', slug: 'sim' });
    for (const label of ['a', 'b']) await db.insert(endUsers).values({ id: `u_${label}_${suffix}`, projectId, externalId: label });

    const day = 86_400_000;
    const add = (user: string, daysAgo: number, amount: number, type = 'purchase') =>
      db.insert(events).values({ id: `evt_${randomUUID()}`, projectId, userId: `u_${user}_${suffix}`, type, payload: { amount }, occurredAt: new Date(Date.now() - daysAgo * day) });
    await add('a', 2, 60);
    await add('a', 1, 60);
    await add('b', 1, 10);
    await add('a', 40, 500); // outside a 30 day window
    await add('a', 1, 999, 'refund'); // another event type
    await db.insert(xpLedger).values({ id: `xpl_${randomUUID()}`, projectId, userId: `u_a_${suffix}`, amount: 100, reason: 'existing' });

    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `sim_${randomUUID()}@example.com`, password: 'Password123!', name: 'Sim' } });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('counts what a rule would have done, without giving anything', async () => {
    const before = await db.select().from(xpLedger).where(eq(xpLedger.projectId, projectId));
    const { status, body } = await simulate({
      rule: { trigger: 'purchase', conditions: { field: 'payload.amount', operator: 'greater_than_or_equal', value: 50 }, actions: [{ type: 'award_xp', params: { amount: 25 } }, { type: 'award_achievement', params: { achievementKey: 'big' } }] },
      days: 30,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ eventsConsidered: 3, matched: 2, usersAffected: 1, xpTotal: 50, xpPerMatch: 25, existingXp: 100, inflationPercent: 50, achievements: [{ key: 'big', count: 2 }] });
    expect(body.byDay.reduce((sum: number, day: { matched: number }) => sum + day.matched, 0)).toBe(2);
    expect(body.topUsers[0]).toMatchObject({ externalId: 'a', xp: 50 });
    expect(await db.select().from(xpLedger).where(eq(xpLedger.projectId, projectId))).toHaveLength(before.length);
  }, 60_000);

  it('widens with the window', async () => {
    const { body } = await simulate({ rule: { trigger: 'purchase', actions: [{ type: 'award_xp', params: { amount: 1 } }] }, days: 90 });
    expect(body).toMatchObject({ eventsConsidered: 4, matched: 4 });
  }, 60_000);

  it('handles totals over time, firing once when the total is reached', async () => {
    const { body } = await simulate({
      rule: {
        trigger: 'purchase',
        conditions: { aggregate: { metric: 'sum', field: 'payload.amount', window: 'last_7d' }, operator: 'greater_than_or_equal', value: 100 },
        actions: [{ type: 'award_xp', params: { amount: 50 } }],
      },
      days: 30,
    });
    // a spends 60 then 60 within a week, crossing 100 on the second
    expect(body.matched).toBe(1);
    expect(body.xpTotal).toBe(50);
  }, 60_000);

  it('says so when there is nothing to test against', async () => {
    const { body } = await simulate({ rule: { trigger: 'never_sent', actions: [{ type: 'award_xp', params: { amount: 1 } }] }, days: 7 });
    expect(body).toMatchObject({ eventsConsidered: 0, matched: 0 });
  }, 60_000);

  it('rejects an invalid rule or window', async () => {
    expect((await simulate({ rule: { trigger: 'purchase', actions: [{ type: 'send_pigeon' }] }, days: 7 })).status).toBe(400);
    expect((await simulate({ rule: { trigger: 'purchase', actions: [{ type: 'award_xp', params: { amount: 1 } }] }, days: 500 })).status).toBe(400);
    expect((await simulate({ nope: true })).status).toBe(400);
  }, 60_000);
});
