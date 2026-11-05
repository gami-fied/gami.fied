import { randomUUID } from 'crypto';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  achievements,
  challengeRewardOutbox,
  challenges,
  db,
  endUsers,
  events,
  levels,
  member,
  organizations,
  projects,
  ruleExecutions,
  rules,
  runMigrations,
  userAchievements,
  userXpBalances,
  webhookEndpoints,
  webhookOutbox,
  webhookSubscriptions,
  xpLedger,
} from '@gami/database';
import { getLeaderboard, getUserRank } from '@gami/leaderboards';
import { encryptSecret } from '@gami/webhooks';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dispatchPendingChallengeRewards } from '../../../worker/src/challenge-processor.js';
import { executeRuleForEvent } from '../../../worker/src/executor.js';
import { dispatchPendingWebhooks } from '../../../worker/src/webhook-dispatcher.js';
import { buildServer } from '../index.js';

describe('Engine regressions', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_eng_${suffix}`;
  const projectId = `prj_eng_${suffix}`;
  const userId = `usr_eng_${suffix}`;

  const makeEvent = async (type = 'lesson_completed', payload: Record<string, unknown> = {}) => {
    const id = `evt_${randomUUID()}`;
    await db.insert(events).values({ id, projectId, userId, type, payload });
    return { id, projectId, userId, type, payload, occurredAt: new Date() };
  };

  const makeRule = async (actions: unknown[], conditions?: unknown) => {
    const id = `rule_${randomUUID()}`;
    await db
      .insert(rules)
      .values({ id, projectId, name: id, trigger: 'lesson_completed', actions, conditions });
    const [rule] = await db.select().from(rules).where(eq(rules.id, id));
    return rule!;
  };

  const makeAchievement = async (enabled = true) => {
    const key = `badge_${randomUUID().slice(0, 8)}`;
    await db.insert(achievements).values({ id: `ach_${key}`, projectId, key, name: key, enabled });
    return key;
  };

  const executionStatus = async (ruleId: string, eventId: string) => {
    const [row] = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleId), eq(ruleExecutions.eventId, eventId)));
    return row;
  };

  const xpTotal = async () => {
    const [row] = await db
      .select({ totalXp: userXpBalances.totalXp })
      .from(userXpBalances)
      .where(eq(userXpBalances.userId, userId));
    return row?.totalXp ?? 0;
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Engine', slug: `eng-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Engine', slug: 'engine' });
    await db.insert(endUsers).values({ id: userId, projectId, externalId: `eng_${suffix}` });
    await db.insert(levels).values([
      { id: `lvl_1_${suffix}`, projectId, level: 1, name: 'One', requiredXp: 0 },
      { id: `lvl_2_${suffix}`, projectId, level: 2, name: 'Two', requiredXp: 100000 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `eng_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Engine',
      },
    });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: JSON.parse(res.payload).user.id,
      role: 'owner',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('duplicate keys', () => {
    it('returns 409 for a duplicate project slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie },
        payload: { organizationId: orgId, name: 'Again', slug: 'engine' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 409 for a duplicate organization slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/organizations',
        headers: { cookie },
        payload: { name: 'Again', slug: `eng-${suffix}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('rule execution', () => {
    it('awards every award_xp action in a rule, once, even when replayed', async () => {
      const before = await xpTotal();
      const rule = await makeRule([
        { type: 'award_xp', params: { amount: 10 } },
        { type: 'award_xp', params: { amount: 5 } },
      ]);
      const event = await makeEvent();

      await expect(executeRuleForEvent(rule, event)).resolves.toMatchObject({ status: 'completed' });
      expect(await xpTotal()).toBe(before + 15);

      await db
        .update(ruleExecutions)
        .set({ status: 'failed' })
        .where(eq(ruleExecutions.ruleId, rule.id));
      await expect(executeRuleForEvent(rule, event)).resolves.toMatchObject({ status: 'completed' });
      expect(await xpTotal()).toBe(before + 15);
    });

    it('grants every achievement in a rule and treats a repeat as success', async () => {
      const [first, second] = [await makeAchievement(), await makeAchievement()];
      const actions = [first, second].map((achievementKey) => ({
        type: 'award_achievement',
        params: { achievementKey },
      }));

      const rule = await makeRule(actions);
      await executeRuleForEvent(rule, await makeEvent());
      const granted = await db
        .select()
        .from(userAchievements)
        .where(eq(userAchievements.userId, userId));
      expect(granted.filter((g) => g.achievementId.endsWith(first!))).toHaveLength(1);
      expect(granted.filter((g) => g.achievementId.endsWith(second!))).toHaveLength(1);

      const repeatRule = await makeRule(actions);
      const repeatEvent = await makeEvent();
      await expect(executeRuleForEvent(repeatRule, repeatEvent)).resolves.toMatchObject({
        status: 'completed',
      });
      expect((await executionStatus(repeatRule.id, repeatEvent.id))?.status).toBe('completed');
    });

    it('records a non-match as skipped rather than failed', async () => {
      const rule = await makeRule([{ type: 'award_xp', params: { amount: 1 } }], {
        field: 'score',
        operator: 'greater_than',
        value: 90,
      });
      const event = await makeEvent('lesson_completed', { score: 10 });

      await executeRuleForEvent(rule, event);
      const execution = await executionStatus(rule.id, event.id);
      expect(execution).toMatchObject({ status: 'skipped', error: null });
    });

    it('stores the real error when a rule cannot be evaluated', async () => {
      const rule = await makeRule([{ type: 'award_xp', params: { amount: 1 } }], {
        field: 'score',
        operator: 'in',
        value: 'a,b',
      });
      const event = await makeEvent();

      await executeRuleForEvent(rule, event);
      const execution = await executionStatus(rule.id, event.id);
      expect(execution?.status).toBe('failed');
      expect(execution?.error).toContain('requires an array');
    });

    it('fails an unknown action rather than reporting success', async () => {
      const rule = await makeRule([{ type: 'send_gift' }]);
      const event = await makeEvent();

      const result = await executeRuleForEvent(rule, event);
      expect(result.status).toBe('failed');
      expect((await executionStatus(rule.id, event.id))?.error).toContain('send_gift');
    });
  });

  describe('saving rules', () => {
    const save = (actions: unknown[]) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/rules`,
        headers: { cookie },
        payload: { name: 'Saved', trigger: 'lesson_completed', actions },
      });

    it('rejects an action type the worker cannot run', async () => {
      expect((await save([{ type: 'send_gift' }])).statusCode).toBe(400);
    });

    it('rejects an achievement key that does not exist', async () => {
      const res = await save([{ type: 'award_achievement', params: { achievementKey: 'nope' } }]);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain('nope');
    });

    it('warns about a disabled achievement', async () => {
      const achievementKey = await makeAchievement(false);
      const res = await save([{ type: 'award_achievement', params: { achievementKey } }]);
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).warnings[0]).toContain(achievementKey);
    });
  });

  describe('manual XP adjustments', () => {
    it('refuses to take a balance below zero and writes nothing', async () => {
      const balance = await xpTotal();
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/users/${userId}/xp/adjust`,
        headers: { cookie },
        payload: { amount: -(balance + 1), reason: 'too much' },
      });

      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).code).toBe('INSUFFICIENT_XP');
      expect(await xpTotal()).toBe(balance);
      const ledger = await db
        .select()
        .from(xpLedger)
        .where(eq(xpLedger.reason, 'manual_adjustment: too much'));
      expect(ledger).toHaveLength(0);
    });
  });

  describe('challenge rewards', () => {
    it('keeps good rewards when another one fails, and records the failure', async () => {
      const challengeId = `chl_${randomUUID()}`;
      const event = await makeEvent('reward_test');
      await db.insert(challenges).values({
        id: challengeId,
        projectId,
        key: challengeId,
        name: 'Rewards',
        trigger: 'reward_test',
        target: 1,
      });

      const base = { projectId, challengeId, userId, eventId: event.id };
      const badId = `cro_bad_${suffix}`;
      const goodId = `cro_good_${suffix}`;
      await db.insert(challengeRewardOutbox).values([
        {
          ...base,
          id: badId,
          rewardType: 'achievement',
          rewardPayload: { type: 'achievement', achievementKey: 'missing' },
        },
        { ...base, id: goodId, rewardType: 'xp', rewardPayload: { type: 'xp', amount: 7 } },
      ]);

      const before = await xpTotal();
      const stats = await dispatchPendingChallengeRewards(50);

      expect(stats.completedCount).toBeGreaterThanOrEqual(1);
      expect(await xpTotal()).toBe(before + 7);

      const [bad] = await db
        .select()
        .from(challengeRewardOutbox)
        .where(eq(challengeRewardOutbox.id, badId));
      expect(bad).toMatchObject({ status: 'pending', attempts: 1 });
      expect(bad?.lastError).toContain('missing');

      await db
        .update(challengeRewardOutbox)
        .set({ attempts: 9, availableAt: new Date(0) })
        .where(eq(challengeRewardOutbox.id, badId));
      await dispatchPendingChallengeRewards(50);
      const [dead] = await db
        .select()
        .from(challengeRewardOutbox)
        .where(eq(challengeRewardOutbox.id, badId));
      expect(dead?.status).toBe('failed');
    });
  });

  describe('webhooks', () => {
    let server: Server | undefined;
    let endpointId: string;

    const listen = async (handler: Parameters<typeof createServer>[1]) => {
      server = createServer(handler);
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    };

    const subscribe = async (url: string, eventTypes: string[]) => {
      endpointId = `wh_${randomUUID()}`;
      await db.insert(webhookEndpoints).values({
        id: endpointId,
        projectId,
        name: 'Hook',
        url,
        encryptedSecret: encryptSecret('whsec_test_secret'),
      });
      await db.insert(webhookSubscriptions).values(
        eventTypes.map((eventType) => ({
          id: `whs_${randomUUID()}`,
          endpointId,
          eventType,
        }))
      );
    };

    const queue = async (count: number) => {
      const ids = Array.from({ length: count }, () => `who_${randomUUID()}`);
      await db.insert(webhookOutbox).values(
        ids.map((id) => ({
          id,
          projectId,
          endpointId,
          eventType: 'xp.awarded',
          eventId: id,
          payload: { id },
        }))
      );
      return ids;
    };

    const statuses = async () =>
      db.select().from(webhookOutbox).where(eq(webhookOutbox.endpointId, endpointId));

    beforeAll(() => {
      process.env.ALLOW_LOCAL_WEBHOOKS = 'true';
    });

    afterEach(async () => {
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));
      await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
      server = undefined;
    });

    afterAll(() => {
      delete process.env.ALLOW_LOCAL_WEBHOOKS;
    });

    it('commits the claim before making the HTTP call', async () => {
      let statusDuringSend: string | undefined;
      const url = await listen((_req, res) => {
        void statuses().then(([row]) => {
          statusDuringSend = row?.status;
          res.statusCode = 200;
          res.end();
        });
      });
      await subscribe(url, ['xp.awarded']);
      await queue(1);

      const stats = await dispatchPendingWebhooks(50);

      expect(stats.deliveredCount).toBe(1);
      expect(statusDuringSend).toBe('processing');
      expect((await statuses())[0]?.status).toBe('delivered');
    });

    it('does not retry a permanent failure', async () => {
      let calls = 0;
      const url = await listen((_req, res) => {
        calls++;
        res.statusCode = 404;
        res.end();
      });
      await subscribe(url, ['xp.awarded']);
      await queue(1);

      await dispatchPendingWebhooks(50);
      await dispatchPendingWebhooks(50);

      expect(calls).toBe(1);
      expect((await statuses())[0]).toMatchObject({ status: 'failed', attempts: 1 });
    });

    it('stops at the first retryable failure without using up other attempts', async () => {
      let calls = 0;
      const url = await listen((_req, res) => {
        calls++;
        res.statusCode = 503;
        res.end();
      });
      await subscribe(url, ['xp.awarded']);
      await queue(3);

      const stats = await dispatchPendingWebhooks(50);

      expect(calls).toBe(1);
      expect(stats.releasedCount).toBe(2);
      const rows = await statuses();
      expect(rows.every((row) => row.status === 'pending')).toBe(true);
      expect(rows.map((row) => row.attempts).sort()).toEqual([0, 0, 1]);
      expect(rows.every((row) => row.availableAt.getTime() > Date.now())).toBe(true);
    });

    it('sends xp.awarded and level.up for rule-based XP', async () => {
      const url = await listen((_req, res) => res.end());
      await subscribe(url, ['xp.awarded', 'level.up']);

      const needed = 100000 - (await xpTotal());
      const rule = await makeRule([{ type: 'award_xp', params: { amount: needed } }]);
      await executeRuleForEvent(rule, await makeEvent());

      const types = (await statuses()).map((row) => row.eventType).sort();
      expect(types).toEqual(['level.up', 'xp.awarded']);
    });
  });

  describe('leaderboards', () => {
    it('handles totals past the 32-bit limit, and hides inactive and zero-XP users', async () => {
      const rich = `usr_rich_${suffix}`;
      const gone = `usr_gone_${suffix}`;
      const zero = `usr_zero_${suffix}`;
      await db.insert(endUsers).values([
        { id: rich, projectId, externalId: rich },
        { id: gone, projectId, externalId: gone, active: false },
        { id: zero, projectId, externalId: zero },
      ]);
      await db.insert(userXpBalances).values([
        { id: `xpb_${rich}`, projectId, userId: rich, totalXp: 3_000_000_000 },
        { id: `xpb_${gone}`, projectId, userId: gone, totalXp: 4_000_000_000 },
      ]);

      const board = await getLeaderboard(projectId);
      expect(board.entries[0]).toMatchObject({ userId: rich, xp: 3_000_000_000, rank: 1 });

      const ids = board.entries.map((entry) => entry.userId);
      expect(ids).not.toContain(gone);
      expect(ids).not.toContain(zero);
      expect((await getUserRank(projectId, zero)).rank).toBeNull();
    });
  });
});
