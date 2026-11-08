import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  events,
  member,
  organizations,
  projectMembers,
  projects,
  runMigrations,
  streakHistory,
  userStreaks,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processStreaksForEvent } from '../../../worker/src/streak-processor.js';
import { buildServer } from '../index.js';

const DAY = 86_400_000;

describe('streaks', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let adminCookie: string;
  let memberCookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_stk_${suffix}`;
  const projectId = `prj_stk_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const signUp = async (label: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `${label}_${randomUUID()}@example.com`, password: 'Password123!', name: label },
    });
    return { cookie: res.headers['set-cookie'] as string, id: JSON.parse(res.payload).user.id as string };
  };

  const createUser = async (label: string, metadata?: Record<string, unknown>) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}`, metadata });
    return id;
  };

  /** Records an event and runs the same step the worker runs. */
  const send = async (userId: string, at: Date, payload: Record<string, unknown> = {}, type = 'lesson_done') => {
    const id = `evt_${randomUUID()}`;
    await db.insert(events).values({ id, projectId, userId, type, payload, occurredAt: at });
    return processStreaksForEvent({ id, projectId, userId, type, payload, occurredAt: at });
  };

  const streakOf = async (userId: string) =>
    (await db.select().from(userStreaks).where(eq(userStreaks.userId, userId)))[0];

  const create = (body: Record<string, unknown>, cookie = adminCookie) =>
    app.inject({ method: 'POST', url: `${base}/streaks`, headers: { cookie }, payload: body });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Streaks', slug: `stk-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Streaks', slug: 'streaks' });

    const admin = await signUp('stk_admin');
    const plain = await signUp('stk_member');
    adminCookie = admin.cookie;
    memberCookie = plain.cookie;
    await db.insert(member).values([
      { id: `mem_a_${suffix}`, organizationId: orgId, userId: admin.id, role: 'owner', createdAt: new Date() },
      { id: `mem_m_${suffix}`, organizationId: orgId, userId: plain.id, role: 'member', createdAt: new Date() },
    ]);
    await db.insert(projectMembers).values({
      id: `pm_${suffix}`,
      projectId,
      userId: plain.id,
      role: 'member',
    });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('definitions', () => {
    it('creates a streak with defaults, and rejects a duplicate key', async () => {
      const res = await create({ key: 'daily_lesson', name: 'Daily lesson', triggerEvent: 'lesson_done' });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload)).toMatchObject({ cadence: 'daily', timeZone: 'UTC', freezeEvery: 0, enabled: true });

      const again = await create({ key: 'daily_lesson', name: 'Again', triggerEvent: 'lesson_done' });
      expect(again.statusCode).toBe(400);
    });

    it('rejects an unknown time zone and a bad cadence', async () => {
      expect((await create({ key: 'bad_zone', name: 'x', triggerEvent: 'e', timeZone: 'Mars/Base' })).statusCode).toBe(400);
      expect((await create({ key: 'bad_cadence', name: 'x', triggerEvent: 'e', cadence: 'hourly' })).statusCode).toBe(400);
    });

    it('lets plain members read streaks but not create them', async () => {
      expect((await create({ key: 'nope', name: 'x', triggerEvent: 'e' }, memberCookie)).statusCode).toBe(403);
      const list = await app.inject({ method: 'GET', url: `${base}/streaks`, headers: { cookie: memberCookie } });
      expect(list.statusCode).toBe(200);
      expect(JSON.parse(list.payload).data.length).toBeGreaterThan(0);
    });

    it('does not let an update change the key, trigger or cadence', async () => {
      const [def] = JSON.parse(
        (await app.inject({ method: 'GET', url: `${base}/streaks`, headers: { cookie: adminCookie } })).payload
      ).data as { id: string; key: string }[];
      const res = await app.inject({
        method: 'PATCH',
        url: `${base}/streaks/${def!.id}`,
        headers: { cookie: adminCookie },
        payload: { key: 'renamed', cadence: 'weekly', name: 'Renamed' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toMatchObject({ key: def!.key, cadence: 'daily', name: 'Renamed' });
    });
  });

  describe('counting activity', () => {
    it('grows over consecutive days and reads back through the API', async () => {
      const userId = await createUser('grow');
      const now = Date.now();
      await send(userId, new Date(now - 2 * DAY));
      await send(userId, new Date(now - 1 * DAY));
      await send(userId, new Date(now - 60_000));

      expect(await streakOf(userId)).toMatchObject({ current: 3, longest: 3 });

      const res = await app.inject({ method: 'GET', url: `${base}/users/${userId}/streaks`, headers: { cookie: adminCookie } });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data[0]).toMatchObject({ key: 'daily_lesson', current: 3, longest: 3 });
    }, 60_000);

    it('counts a repeat event, or a second event the same day, once', async () => {
      const userId = await createUser('repeat');
      const at = new Date(Date.now() - 3600_000);
      await send(userId, at);
      await send(userId, new Date(at.getTime() + 60_000));
      await send(userId, at);

      expect((await streakOf(userId))?.current).toBe(1);
      const history = await db.select().from(streakHistory).where(eq(streakHistory.userId, userId));
      expect(history).toHaveLength(1);
    }, 60_000);

    it('resets after a gap and records what ended', async () => {
      const userId = await createUser('gap');
      const now = Date.now();
      await send(userId, new Date(now - 6 * DAY));
      await send(userId, new Date(now - 5 * DAY));
      await send(userId, new Date(now - 60_000));

      expect(await streakOf(userId)).toMatchObject({ current: 1, longest: 2 });
      const history = await db.select().from(streakHistory).where(eq(streakHistory.userId, userId));
      expect(history.find((row) => row.change === 'reset')).toMatchObject({ brokenStreak: 2 });
    }, 60_000);

    it('ignores events of other types and users that do not exist', async () => {
      const userId = await createUser('other');
      expect(await send(userId, new Date(), {}, 'something_else')).toBe(0);
      expect(await streakOf(userId)).toBeUndefined();

      const ghost = `evt_${randomUUID()}`;
      expect(
        await processStreaksForEvent({
          id: ghost,
          projectId,
          userId: 'nobody',
          type: 'lesson_done',
          payload: {},
          occurredAt: new Date(),
        })
      ).toBe(0);
    }, 60_000);

    it("uses the user's own time zone from the event, then their profile", async () => {
      // 15:30 UTC is 00:30 the next day in Tokyo, so these two events are consecutive days there.
      const day = Math.floor(Date.now() / DAY) * DAY - 5 * DAY;
      const fromEvent = await createUser('tokyo_event');
      await send(fromEvent, new Date(day + 14.5 * 3600_000), { timezone: 'Asia/Tokyo' });
      await send(fromEvent, new Date(day + 15.5 * 3600_000), { timezone: 'Asia/Tokyo' });
      expect((await streakOf(fromEvent))?.current).toBe(2);

      const fromProfile = await createUser('tokyo_profile', { timezone: 'Asia/Tokyo' });
      await send(fromProfile, new Date(day + 14.5 * 3600_000));
      await send(fromProfile, new Date(day + 15.5 * 3600_000));
      expect((await streakOf(fromProfile))?.current).toBe(2);

      const utc = await createUser('utc_user');
      await send(utc, new Date(day + 14.5 * 3600_000));
      await send(utc, new Date(day + 15.5 * 3600_000));
      expect((await streakOf(utc))?.current).toBe(1);
    }, 60_000);
  });

  describe('history', () => {
    it('lists changes newest first', async () => {
      const userId = await createUser('hist');
      const now = Date.now();
      await send(userId, new Date(now - 1 * DAY));
      await send(userId, new Date(now - 60_000));

      const res = await app.inject({
        method: 'GET',
        url: `${base}/users/${userId}/streaks/history`,
        headers: { cookie: adminCookie },
      });
      const data = JSON.parse(res.payload).data as { change: string; current: number }[];
      expect(data.map((row) => row.change)).toEqual(['extended', 'started']);
      expect(data[0]!.current).toBe(2);
    }, 60_000);

    it('returns 404 for an unknown user', async () => {
      const res = await app.inject({ method: 'GET', url: `${base}/users/nobody/streaks`, headers: { cookie: adminCookie } });
      expect(res.statusCode).toBe(404);
    });
  });
});
