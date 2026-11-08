import { randomUUID } from 'crypto';
import {
  db,
  emailNotificationOutbox,
  endUsers,
  events,
  lifecycleCampaigns,
  lifecycleSends,
  member,
  notificationPreferences,
  organizations,
  projects,
  runMigrations,
  streakDefinitions,
  userStreaks,
  xpLedger,
} from '@gami/database';
import { periodIndex } from '@gami/progression';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCampaign } from '../../../worker/src/lifecycle.js';
import { buildServer } from '../index.js';

const DAY = 86_400_000;

describe('lifecycle emails', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_lc_${suffix}`;
  const projectId = `prj_lc_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const makeUser = async (label: string, email: string | null = `${label}_${suffix}@example.com`) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}`, name: label, email });
    return id;
  };

  const makeCampaign = async (kind: string, subject: string, body: string, config: Record<string, unknown>) => {
    const id = `lcp_${randomUUID()}`;
    await db.insert(lifecycleCampaigns).values({ id, projectId, name: kind, kind, subject, body, config, enabled: true });
    const [campaign] = await db.select().from(lifecycleCampaigns).where(eq(lifecycleCampaigns.id, id));
    return campaign!;
  };

  const emailsTo = async (userId: string) =>
    db.select().from(emailNotificationOutbox).where(eq(emailNotificationOutbox.userId, userId));

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'LC', slug: `lc-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Acme', slug: 'lc' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `lc_${randomUUID()}@example.com`, password: 'Password123!', name: 'LC' },
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

  describe('streak reminders', () => {
    it('emails people whose streak is alive but not done today, once per day', async () => {
      const definitionId = `sdf_${randomUUID()}`;
      await db.insert(streakDefinitions).values({ id: definitionId, projectId, key: 'daily_lesson', name: 'Daily lesson', triggerEvent: 'lesson_done' });
      const now = new Date('2026-03-18T20:00:00Z');
      const yesterday = periodIndex(new Date(now.getTime() - DAY), 'UTC', 'daily');
      const today = periodIndex(now, 'UTC', 'daily');
      const base = { projectId, definitionId, freezes: 0, timeZone: 'UTC' };

      const atRisk = await makeUser('atrisk');
      const doneToday = await makeUser('done');
      const lapsed = await makeUser('lapsed');
      const noEmail = await makeUser('noemail', null);
      const optedOut = await makeUser('optout');
      await db.insert(userStreaks).values([
        { ...base, id: `stk_${randomUUID()}`, userId: atRisk, current: 5, longest: 5, lastPeriod: yesterday, lastActivityAt: new Date(now.getTime() - 20 * 3600_000) },
        { ...base, id: `stk_${randomUUID()}`, userId: doneToday, current: 5, longest: 5, lastPeriod: today, lastActivityAt: new Date(now.getTime() - 3600_000) },
        { ...base, id: `stk_${randomUUID()}`, userId: lapsed, current: 5, longest: 5, lastPeriod: today - 4, lastActivityAt: new Date(now.getTime() - 4 * DAY) },
        { ...base, id: `stk_${randomUUID()}`, userId: noEmail, current: 5, longest: 5, lastPeriod: yesterday, lastActivityAt: new Date(now.getTime() - 20 * 3600_000) },
        { ...base, id: `stk_${randomUUID()}`, userId: optedOut, current: 5, longest: 5, lastPeriod: yesterday, lastActivityAt: new Date(now.getTime() - 20 * 3600_000) },
      ]);
      await db.insert(notificationPreferences).values({
        id: `npf_${randomUUID()}`,
        projectId,
        userId: optedOut,
        channel: 'email',
        notificationType: 'xp_awarded',
        enabled: false,
      });

      const campaign = await makeCampaign(
        'streak_reminder',
        'Keep your {{streak_name}} streak',
        'Hi {{name}}, you are on {{streak_days}} {{streak_unit}}s. Back to {{app_name}}!',
        { streak: 'daily_lesson', sendAfterHour: 18 }
      );

      expect(await runCampaign(campaign, now)).toBe(1);
      const [email] = await emailsTo(atRisk);
      expect(email).toMatchObject({ subject: 'Keep your Daily lesson streak', recipientEmail: `atrisk_${suffix}@example.com`, status: 'pending' });
      expect(email!.textBody).toContain('Hi atrisk, you are on 5 days. Back to Acme!');
      for (const other of [doneToday, lapsed, noEmail, optedOut]) expect(await emailsTo(other)).toHaveLength(0);

      // Running again the same day sends nothing more.
      expect(await runCampaign(campaign, now)).toBe(0);
      expect(await emailsTo(atRisk)).toHaveLength(1);

      // The next day's reminder is a new one. People who did it today are now the ones who might miss tomorrow.
      const nextDay = new Date(now.getTime() + DAY - 3600_000);
      await db.update(userStreaks).set({ lastPeriod: today, lastActivityAt: now }).where(eq(userStreaks.userId, atRisk));
      expect(await runCampaign(campaign, nextDay)).toBe(2);
      expect(await emailsTo(atRisk)).toHaveLength(2);
      expect(await emailsTo(doneToday)).toHaveLength(1);
    }, 180_000);

    it('waits until the person local evening', async () => {
      const campaign = await makeCampaign('streak_reminder', 'x {{streak_name}}', 'y', { streak: 'daily_lesson', sendAfterHour: 18 });
      const userId = await makeUser('tokyo');
      const [definition] = await db.select().from(streakDefinitions).where(eq(streakDefinitions.projectId, projectId));
      const morning = new Date('2026-03-18T01:00:00Z'); // 10:00 in Tokyo
      await db.insert(userStreaks).values({
        id: `stk_${randomUUID()}`,
        projectId,
        userId,
        definitionId: definition!.id,
        current: 3,
        longest: 3,
        lastPeriod: periodIndex(new Date(morning.getTime() - DAY), 'Asia/Tokyo', 'daily'),
        lastActivityAt: new Date(morning.getTime() - 15 * 3600_000),
        timeZone: 'Asia/Tokyo',
      });

      await runCampaign(campaign, morning);
      expect(await emailsTo(userId)).toHaveLength(0);
      await runCampaign(campaign, new Date('2026-03-18T10:00:00Z')); // 19:00 in Tokyo
      expect(await emailsTo(userId)).toHaveLength(1);
    }, 120_000);
  });

  describe('weekly recap', () => {
    it('summarises the week for people who were active, only in its send window, once', async () => {
      const userId = await makeUser('recap');
      const quiet = await makeUser('quiet');
      const now = new Date('2026-03-16T09:30:00Z'); // Monday 09:30
      await db.insert(xpLedger).values([
        { id: `xp_${randomUUID()}`, projectId, userId, amount: 100, reason: 'a', createdAt: new Date(now.getTime() - 2 * DAY) },
        { id: `xp_${randomUUID()}`, projectId, userId, amount: 40, reason: 'b', createdAt: new Date(now.getTime() - DAY) },
      ]);
      void quiet;

      const campaign = await makeCampaign('weekly_recap', 'Week for {{name}}', 'You earned {{xp_week}} XP, {{achievements_week}} badges.', { weekday: 0, hour: 9 });

      expect(await runCampaign(campaign, new Date('2026-03-16T08:00:00Z'))).toBe(0); // before the time
      expect(await runCampaign(campaign, new Date('2026-03-18T09:30:00Z'))).toBe(0); // long after the window
      expect(await runCampaign(campaign, now)).toBeGreaterThanOrEqual(1);

      const [email] = await emailsTo(userId);
      expect(email!.subject).toBe('Week for recap');
      expect(email!.textBody).toContain('You earned 140 XP, 0 badges.');
      expect(await emailsTo(quiet)).toHaveLength(0);

      await runCampaign(campaign, new Date('2026-03-16T10:30:00Z'));
      expect(await emailsTo(userId)).toHaveLength(1);
    }, 120_000);
  });

  describe('win-back', () => {
    it('emails people who drifted away, once per spell, and not those gone too long', async () => {
      const now = new Date('2026-03-18T12:00:00Z');
      const away = await makeUser('away');
      const recent = await makeUser('recent');
      const ancient = await makeUser('ancient');
      const record = (userId: string, daysAgo: number) =>
        db.insert(events).values({ id: `evt_${randomUUID()}`, projectId, userId, type: 'visit', payload: {}, occurredAt: new Date(now.getTime() - daysAgo * DAY) });
      await record(away, 20);
      await record(recent, 3);
      await record(ancient, 200);

      const campaign = await makeCampaign('winback', 'Miss you {{name}}', 'Gone {{days_away}} days.', { inactiveDays: 14, maxDays: 90 });
      await runCampaign(campaign, now);

      const [email] = await emailsTo(away);
      expect(email!.textBody).toContain('Gone 20 days.');
      expect(await emailsTo(recent)).toHaveLength(0);
      expect(await emailsTo(ancient)).toHaveLength(0);

      await runCampaign(campaign, new Date(now.getTime() + 2 * DAY));
      expect(await emailsTo(away)).toHaveLength(1);

      const sends = await db.select().from(lifecycleSends).where(and(eq(lifecycleSends.campaignId, campaign.id), eq(lifecycleSends.userId, away)));
      expect(sends).toHaveLength(1);
      expect(sends[0]!.emailOutboxId).toBe(email!.id);
    }, 120_000);
  });

  describe('managing campaigns', () => {
    it('creates from defaults, rejects bad templates, previews, and reports sends', async () => {
      const templates = JSON.parse((await app.inject({ method: 'GET', url: `${base}/campaigns/templates`, headers: { cookie } })).payload);
      expect(templates.data.map((item: { kind: string }) => item.kind)).toEqual(['streak_reminder', 'weekly_recap', 'winback']);

      const bad = await app.inject({
        method: 'POST',
        url: `${base}/campaigns`,
        headers: { cookie },
        payload: { kind: 'winback', name: 'Bad', subject: 'Hi {{nope}}', body: 'x' },
      });
      expect(bad.statusCode).toBe(400);
      expect(JSON.parse(bad.payload).message).toContain('{{nope}}');

      const noStreak = await app.inject({
        method: 'POST',
        url: `${base}/campaigns`,
        headers: { cookie },
        payload: { kind: 'streak_reminder', name: 'No streak', subject: 'Hi', body: 'x' },
      });
      expect(noStreak.statusCode).toBe(400);

      const good = await app.inject({
        method: 'POST',
        url: `${base}/campaigns`,
        headers: { cookie },
        payload: { kind: 'winback', name: 'Come back', subject: 'Hi {{name}}', body: 'Back after {{days_away}} days' },
      });
      expect(good.statusCode).toBe(201);
      const created = JSON.parse(good.payload);
      expect(created).toMatchObject({ enabled: false, config: { inactiveDays: 14, maxDays: 90 } });

      const preview = await app.inject({
        method: 'POST',
        url: `${base}/campaigns/preview`,
        headers: { cookie },
        payload: { kind: 'winback', subject: 'Hi {{name}}', body: 'Back after {{days_away}} days' },
      });
      expect(JSON.parse(preview.payload)).toMatchObject({ subject: 'Hi Ada' });
      expect(JSON.parse(preview.payload).textBody).toContain('Back after 21 days');

      const toggled = await app.inject({ method: 'PATCH', url: `${base}/campaigns/${created.id}`, headers: { cookie }, payload: { enabled: true } });
      expect(JSON.parse(toggled.payload).enabled).toBe(true);

      const badEdit = await app.inject({ method: 'PATCH', url: `${base}/campaigns/${created.id}`, headers: { cookie }, payload: { config: { inactiveDays: 50, maxDays: 10 } } });
      expect(badEdit.statusCode).toBe(400);

      const list = JSON.parse((await app.inject({ method: 'GET', url: `${base}/campaigns`, headers: { cookie } })).payload);
      expect(list.data.find((item: { id: string }) => item.id === created.id)).toMatchObject({ sentTotal: 0, sentLastWeek: 0 });

      const gone = await app.inject({ method: 'DELETE', url: `${base}/campaigns/${created.id}`, headers: { cookie } });
      expect(gone.statusCode).toBe(204);
    }, 120_000);
  });
});
