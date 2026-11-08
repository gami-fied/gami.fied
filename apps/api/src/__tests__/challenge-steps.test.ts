import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  events,
  member,
  organizations,
  projects,
  runMigrations,
  userChallengeProgress,
  userXpBalances,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processChallengesForEvent } from '../../../worker/src/challenge-processor.js';
import { buildServer } from '../index.js';

const DAY = 86_400_000;

describe('multi-step and repeating challenges', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_cs_${suffix}`;
  const projectId = `prj_cs_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const create = async (body: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: `${base}/challenges`, headers: { cookie }, payload: body });
    return { status: res.statusCode, body: JSON.parse(res.payload) };
  };

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };

  const send = async (userId: string, type: string, payload: Record<string, unknown> = {}, at = new Date()) => {
    const id = `evt_${randomUUID()}`;
    await db.insert(events).values({ id, projectId, userId, type, payload, occurredAt: at });
    return processChallengesForEvent({ id, projectId, userId, type, payload, occurredAt: at });
  };

  const progressOf = async (userId: string, challengeId: string) =>
    db.select().from(userChallengeProgress).where(eq(userChallengeProgress.userId, userId));

  const xp = async (userId: string) =>
    (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, userId)))[0]?.totalXp ?? 0;

  const view = async (userId: string, challengeId: string) =>
    JSON.parse(
      (await app.inject({ method: 'GET', url: `${base}/users/${userId}/challenges/${challengeId}`, headers: { cookie } })).payload
    );

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'CS', slug: `cs-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'CS', slug: 'cs' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `cs_${randomUUID()}@example.com`, password: 'Password123!', name: 'CS' },
    });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: JSON.parse(res.payload).user.id,
      role: 'owner',
      createdAt: new Date(),
    });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('completes steps only in order, and rewards once', async () => {
    const { status, body } = await create({
      key: 'onboarding',
      name: 'Onboarding',
      type: 'steps',
      steps: [
        { name: 'Sign up', event: 'signed_up' },
        { name: 'Add a photo', event: 'photo_added' },
        { name: 'Post', event: 'posted', filters: [{ field: 'payload.words', operator: 'greater_than_or_equal', value: 20 }] },
      ],
      rewards: [{ type: 'xp', amount: 300 }],
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({ type: 'steps', trigger: 'signed_up', target: 3 });

    const userId = await makeUser('stepper');

    // Out of order: nothing happens.
    await send(userId, 'posted', { words: 50 });
    await send(userId, 'photo_added');
    expect((await view(userId, body.id)).progress).toBe(0);

    await send(userId, 'signed_up');
    expect(await view(userId, body.id)).toMatchObject({
      progress: 1,
      steps: [{ done: true }, { done: false }, { done: false }],
    });

    await send(userId, 'signed_up'); // repeating a finished step does nothing
    await send(userId, 'photo_added');
    await send(userId, 'posted', { words: 5 }); // the step's own condition is not met
    expect((await view(userId, body.id)).progress).toBe(2);

    await send(userId, 'posted', { words: 30 });
    const done = await view(userId, body.id);
    expect(done).toMatchObject({ progress: 3, completed: true, percent: 100, completions: 1 });
    expect(await xp(userId)).toBe(300);

    await send(userId, 'posted', { words: 30 });
    expect(await xp(userId)).toBe(300);
  }, 240_000);

  it('only counts events that meet the challenge conditions', async () => {
    const { body } = await create({
      key: 'big_orders',
      name: 'Big orders',
      trigger: 'order',
      target: 2,
      filters: [{ field: 'payload.total', operator: 'greater_than', value: 50 }],
      rewards: [{ type: 'xp', amount: 10 }],
    });
    const userId = await makeUser('filtered');

    await send(userId, 'order', { total: 20 });
    await send(userId, 'order', { total: 80 });
    expect((await view(userId, body.id)).progress).toBe(1);
    // Events that never counted leave no progress row behind for challenges they cannot move.
    await send(userId, 'order', { total: 90 });
    expect((await view(userId, body.id)).completed).toBe(true);
  }, 120_000);

  it('starts a daily challenge over each day and keeps the history', async () => {
    const { body } = await create({
      key: 'daily_quest',
      name: 'Daily quest',
      trigger: 'workout',
      target: 2,
      recurrence: 'daily',
      rewards: [{ type: 'xp', amount: 25 }],
    });
    const userId = await makeUser('daily');
    const today = new Date(Date.now() - 60_000);
    const yesterday = new Date(today.getTime() - DAY);

    await send(userId, 'workout', {}, yesterday);
    await send(userId, 'workout', {}, new Date(yesterday.getTime() + 1000));
    expect(await xp(userId)).toBe(25); // finished yesterday's

    expect(await view(userId, body.id)).toMatchObject({ progress: 0, completed: false, completions: 1 });

    await send(userId, 'workout', {}, today);
    expect(await view(userId, body.id)).toMatchObject({ progress: 1, completed: false });
    await send(userId, 'workout', {}, new Date(today.getTime() + 1000));
    expect(await view(userId, body.id)).toMatchObject({ progress: 2, completed: true, completions: 2 });
    expect(await xp(userId)).toBe(50);

    const rows = await progressOf(userId, body.id);
    expect(rows.map((row) => row.periodKey).sort()).toHaveLength(2);
    expect(new Set(rows.map((row) => row.periodKey)).size).toBe(2);
  }, 240_000);

  describe('editing', () => {
    it('refuses to change steps once users have progress, but allows renaming', async () => {
      const { body } = await create({
        key: 'locked',
        name: 'Locked',
        type: 'steps',
        steps: [
          { name: 'One', event: 'one' },
          { name: 'Two', event: 'two' },
        ],
        rewards: [],
      });
      const userId = await makeUser('locker');
      await send(userId, 'one');

      const patch = (payload: Record<string, unknown>) =>
        app.inject({ method: 'PATCH', url: `${base}/challenges/${body.id}`, headers: { cookie }, payload });

      expect((await patch({ steps: [{ name: 'One', event: 'one' }, { name: 'Three', event: 'three' }] })).statusCode).toBe(409);
      expect((await patch({ name: 'Renamed' })).statusCode).toBe(200);
    }, 120_000);

    it('lets steps change while nobody has started', async () => {
      const { body } = await create({
        key: 'fresh',
        name: 'Fresh',
        type: 'steps',
        steps: [
          { name: 'One', event: 'one' },
          { name: 'Two', event: 'two' },
        ],
        rewards: [],
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `${base}/challenges/${body.id}`,
        headers: { cookie },
        payload: { steps: [{ name: 'A', event: 'a' }, { name: 'B', event: 'b' }, { name: 'C', event: 'c' }] },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toMatchObject({ target: 3, trigger: 'a' });
    });

    it('rejects an invalid steps challenge', async () => {
      const { status } = await create({ key: 'bad', name: 'Bad', type: 'steps', steps: [{ name: 'Only', event: 'x' }], rewards: [] });
      expect(status).toBe(400);
    });
  });
});
