import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  eventOutbox,
  events,
  organizations,
  projects,
  runMigrations,
  rules,
  streakDefinitions,
  userXpBalances,
} from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeRuleForEvent } from '../../../worker/src/executor.js';
import { processStreaksForEvent } from '../../../worker/src/streak-processor.js';

const DAY = 86_400_000;

describe('rules that look back over past events, and streak events', () => {
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_agg_${suffix}`;
  const projectId = `prj_agg_${suffix}`;

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };

  const makeRule = async (trigger: string, conditions: unknown, amount = 50) => {
    const id = `rule_${randomUUID()}`;
    await db.insert(rules).values({
      id,
      projectId,
      name: id,
      trigger,
      conditions,
      actions: [{ type: 'award_xp', params: { amount } }],
    });
    const [rule] = await db.select().from(rules).where(eq(rules.id, id));
    return rule!;
  };

  const record = async (userId: string, type: string, payload: Record<string, unknown>, at: Date) => {
    const id = `evt_${randomUUID()}`;
    await db.insert(events).values({ id, projectId, userId, type, payload, occurredAt: at });
    return { id, projectId, userId, type, payload, occurredAt: at };
  };

  const xp = async (userId: string) =>
    (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, userId)))[0]?.totalXp ?? 0;

  beforeAll(async () => {
    await runMigrations();
    await db.insert(organizations).values({ id: orgId, name: 'Agg', slug: `agg-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Agg', slug: 'agg' });
  }, 60_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('awards once when spending crosses the threshold, and not on later purchases', async () => {
    const userId = await makeUser('spend');
    const rule = await makeRule('purchase', {
      aggregate: { metric: 'sum', field: 'payload.amount', window: 'calendar_month' },
      operator: 'greater_than_or_equal',
      value: 100,
    });
    const base = Date.now() - 3600_000;

    const results = [];
    for (const [index, amount] of [40, 40, 40, 40].entries()) {
      const event = await record(userId, 'purchase', { amount }, new Date(base + index * 1000));
      results.push((await executeRuleForEvent(rule, event)).status);
    }

    expect(results).toEqual(['skipped', 'skipped', 'completed', 'skipped']);
    expect(await xp(userId)).toBe(50);
  }, 120_000);

  it('only counts the matching event type, this user, and the window', async () => {
    const userId = await makeUser('window');
    const other = await makeUser('window_other');
    const rule = await makeRule('purchase', {
      aggregate: { metric: 'sum', field: 'payload.amount', window: 'last_7d' },
      operator: 'greater_than_or_equal',
      value: 100,
    });
    const now = Date.now() - 60_000;

    await record(userId, 'refund', { amount: 500 }, new Date(now - 1000)); // another type
    await record(other, 'purchase', { amount: 500 }, new Date(now - 2000)); // another user
    await record(userId, 'purchase', { amount: 500 }, new Date(now - 10 * DAY)); // outside the window
    await record(userId, 'purchase', { amount: 'lots' }, new Date(now - 3000)); // not a number

    const small = await record(userId, 'purchase', { amount: 60 }, new Date(now));
    expect((await executeRuleForEvent(rule, small)).status).toBe('skipped');

    const crossing = await record(userId, 'purchase', { amount: 60 }, new Date(now + 1000));
    expect((await executeRuleForEvent(rule, crossing)).status).toBe('completed');
  }, 120_000);

  it('counts unique values', async () => {
    const userId = await makeUser('unique');
    const rule = await makeRule('visit', {
      aggregate: { metric: 'unique', field: 'payload.page', window: 'all_time' },
      operator: 'equals',
      value: 3,
    });
    const base = Date.now() - 60_000;
    const statuses = [];
    for (const [index, page] of ['a', 'b', 'a', 'c', 'c'].entries()) {
      const event = await record(userId, 'visit', { page }, new Date(base + index * 1000));
      statuses.push((await executeRuleForEvent(rule, event)).status);
    }
    expect(statuses).toEqual(['skipped', 'skipped', 'skipped', 'completed', 'skipped']);
  }, 120_000);

  it('gives the same answer when an event is processed again', async () => {
    const userId = await makeUser('replay');
    const rule = await makeRule('purchase', {
      aggregate: { metric: 'count', window: 'all_time' },
      operator: 'equals',
      value: 2,
    });
    const first = await record(userId, 'purchase', {}, new Date(Date.now() - 5000));
    const second = await record(userId, 'purchase', {}, new Date(Date.now() - 4000));
    await record(userId, 'purchase', {}, new Date(Date.now() - 3000));

    await executeRuleForEvent(rule, first);
    expect((await executeRuleForEvent(rule, second)).status).toBe('completed');
    expect((await executeRuleForEvent(rule, second)).status).toBe('skipped');
    expect(await xp(userId)).toBe(50);
  }, 120_000);

  it('lets a rule reward a streak milestone through the streak_updated event', async () => {
    const userId = await makeUser('milestone');
    await db.insert(streakDefinitions).values({
      id: `sdf_${randomUUID()}`,
      projectId,
      key: 'daily_lesson',
      name: 'Daily lesson',
      triggerEvent: 'lesson_done',
    });
    const rule = await makeRule(
      'streak_updated',
      {
        all: [
          { field: 'payload.streak', operator: 'equals', value: 'daily_lesson' },
          { field: 'payload.current', operator: 'equals', value: 3 },
        ],
      },
      100
    );

    const now = Date.now();
    for (const days of [2, 1, 0]) {
      const source = await record(userId, 'lesson_done', {}, new Date(now - days * DAY - 60_000));
      await processStreaksForEvent(source);
    }

    const emitted = await db
      .select()
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.type, 'streak_updated')));
    expect(emitted).toHaveLength(3);
    expect(emitted.every((row) => (row.payload as { streak: string }).streak === 'daily_lesson')).toBe(true);

    // Each emitted event is queued like any other, so the normal pipeline picks it up.
    const queued = await db.select().from(eventOutbox);
    expect(emitted.every((row) => queued.some((item) => item.eventId === row.id))).toBe(true);

    for (const row of emitted) {
      await executeRuleForEvent(rule, {
        id: row.id,
        projectId,
        userId,
        type: row.type,
        payload: row.payload as Record<string, unknown>,
        occurredAt: row.occurredAt,
      });
    }
    expect(await xp(userId)).toBe(100);

    // Counting the same activity again must not emit the event a second time.
    const again = await record(userId, 'lesson_done', {}, new Date(now - 60_000));
    await processStreaksForEvent(again);
    const after = await db
      .select()
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.type, 'streak_updated')));
    expect(after).toHaveLength(3);
  }, 180_000);

  it('does not let a streak listen for its own event', async () => {
    const userId = await makeUser('loop');
    const result = await processStreaksForEvent({
      id: `evt_${randomUUID()}`,
      projectId,
      userId,
      type: 'streak_updated',
      payload: {},
      occurredAt: new Date(),
    });
    expect(result).toBe(0);
  });
});
