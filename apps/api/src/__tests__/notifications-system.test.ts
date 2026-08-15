import { randomUUID } from 'crypto';
import {
  achievements,
  challenges,
  db,
  endUsers,
  levels,
  notificationOutbox,
  notifications,
  rules,
} from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processEventJob } from '../../../worker/src/processor.js';
import {
  dispatchPendingNotifications,
  MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
} from '../../../worker/src/notification-dispatcher.ts';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';
import { eq, and, sql } from 'drizzle-orm';

describe('Milestone 13 — Notifications & Reward Delivery Foundation System Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookieOwnerA: string;
  let orgIdA: string;
  let projIdA: string;
  let projIdB: string;
  let apiKeySecretA: string;
  let userIdA: string;
  let userIdB: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Sign up Dashboard Owner
    const emailA = `owner_notif_${randomUUID()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: emailA, password: 'SecurePassword123!', name: 'Owner Notif' },
    });
    cookieOwnerA = signupRes.headers['set-cookie'] as string;

    // 2. Create Org A & Project A
    const orgResA = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieOwnerA },
      payload: { name: 'Notif Org A', slug: `notif-org-a-${randomUUID()}` },
    });
    orgIdA = JSON.parse(orgResA.payload).id;

    const prjResA = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieOwnerA },
      payload: {
        organizationId: orgIdA,
        name: 'Notif Project A',
        slug: `notif-prj-a-${randomUUID()}`,
      },
    });
    projIdA = JSON.parse(prjResA.payload).id;

    const keyDataA = await createApiKey(projIdA, 'Key Notif A');
    apiKeySecretA = keyDataA.rawSecret;

    // 3. Create Project B in Org A
    const prjResB = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieOwnerA },
      payload: {
        organizationId: orgIdA,
        name: 'Notif Project B',
        slug: `notif-prj-b-${randomUUID()}`,
      },
    });
    projIdB = JSON.parse(prjResB.payload).id;

    // 4. Create End Users
    userIdA = `usr_notif_a_${randomUUID()}`;
    await db.insert(endUsers).values({
      id: userIdA,
      projectId: projIdA,
      externalId: `ext_${userIdA}`,
    });

    userIdB = `usr_notif_b_${randomUUID()}`;
    await db.insert(endUsers).values({
      id: userIdB,
      projectId: projIdB,
      externalId: `ext_${userIdB}`,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('1. Database & Service Idempotency Tests', () => {
    it('creates notification intent and outbox record atomically', async () => {
      const sourceId = `src_test_${randomUUID()}`;
      const res = await db.transaction(async (tx) => {
        return await createNotificationIntent(tx, {
          projectId: projIdA,
          userId: userIdA,
          type: 'xp_awarded',
          data: { amount: 100, reason: 'Test Award' },
          sourceType: 'xp_awarded',
          sourceId,
        });
      });

      expect(res.status).toBe('created');
      expect(res.notification).toBeDefined();

      const [outboxRecord] = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.notificationId, res.notification!.id));

      expect(outboxRecord).toBeDefined();
      expect(outboxRecord.status).toBe('pending');
    });

    it('prevents duplicate notification creation via PostgreSQL unique constraint', async () => {
      const sourceId = `src_dup_${randomUUID()}`;

      const first = await db.transaction(async (tx) => {
        return await createNotificationIntent(tx, {
          projectId: projIdA,
          userId: userIdA,
          type: 'xp_awarded',
          data: { amount: 50, reason: 'First' },
          sourceType: 'xp_awarded',
          sourceId,
        });
      });

      const second = await db.transaction(async (tx) => {
        return await createNotificationIntent(tx, {
          projectId: projIdA,
          userId: userIdA,
          type: 'xp_awarded',
          data: { amount: 50, reason: 'Second' },
          sourceType: 'xp_awarded',
          sourceId,
        });
      });

      expect(first.status).toBe('created');
      expect(second.status).toBe('skipped');

      const outboxItems = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.notificationId, first.notification!.id));
      expect(outboxItems.length).toBe(1);
    });
  });

  describe('2. Pipeline Gamification Notifications & Concurrency Tests', () => {
    it('creates xp_awarded and level_up notifications on XP award', async () => {
      // Configure level definitions for Project A
      await db
        .insert(levels)
        .values([
          {
            id: `lvl_1_${randomUUID()}`,
            projectId: projIdA,
            level: 1,
            name: 'Rookie',
            requiredXp: '0',
            enabled: true,
          },
          {
            id: `lvl_2_${randomUUID()}`,
            projectId: projIdA,
            level: 2,
            name: 'Adventurer',
            requiredXp: '100',
            enabled: true,
          },
          {
            id: `lvl_3_${randomUUID()}`,
            projectId: projIdA,
            level: 3,
            name: 'Hero',
            requiredXp: '300',
            enabled: true,
          },
        ])
        .onConflictDoUpdate({
          target: [levels.projectId, levels.level],
          set: {
            name: sql`excluded.name`,
            requiredXp: sql`excluded.required_xp`,
            enabled: true,
          },
        });

      // Create a rule that awards 350 XP on 'level_test' event
      const ruleId = `rule_lvl_${randomUUID()}`;
      await db.insert(rules).values({
        id: ruleId,
        projectId: projIdA,
        name: 'Award 350 XP',
        trigger: 'level_test',
        conditions: {},
        actions: [{ type: 'award_xp', params: { amount: 350, reason: 'Level Test' } }],
        enabled: true,
      });

      // Ingest event
      const testUser = `usr_lvl_${randomUUID()}`;
      await db.insert(endUsers).values({
        id: testUser,
        projectId: projIdA,
        externalId: testUser,
      });

      const evtRes = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecretA },
        payload: {
          event: 'level_test',
          user_id: testUser,
        },
      });
      expect(evtRes.statusCode).toBe(202);
      const body1 = JSON.parse(evtRes.payload);
      const eventId1 = body1.id || body1.eventId;

      // Process event job
      await processEventJob(eventId1);

      // Check notifications generated for testUser
      const userNotifs = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.projectId, projIdA), eq(notifications.userId, testUser)));

      const xpNotif = userNotifs.find((n) => n.type === 'xp_awarded');
      const levelNotifs = userNotifs.filter((n) => n.type === 'level_up');

      expect(xpNotif).toBeDefined();
      expect(xpNotif?.message).toContain('350 XP');

      // User crossed from Level 1 to Level 2 and Level 3 -> expect 2 level_up notifications!
      expect(levelNotifs.length).toBe(2);
      const lvl2Notif = levelNotifs.find((n) => (n.data as { newLevel: number }).newLevel === 2);
      const lvl3Notif = levelNotifs.find((n) => (n.data as { newLevel: number }).newLevel === 3);
      expect(lvl2Notif).toBeDefined();
      expect(lvl3Notif).toBeDefined();
    });

    it('handles concurrent XP awards crossing level thresholds with exactly one level_up notification per level', async () => {
      const concurrentUser = `usr_conc_${randomUUID()}`;
      await db.insert(endUsers).values({
        id: concurrentUser,
        projectId: projIdA,
        externalId: concurrentUser,
      });

      // Fire 5 events concurrently
      const ruleId = `rule_conc_${randomUUID()}`;
      await db.insert(rules).values({
        id: ruleId,
        projectId: projIdA,
        name: 'Award 150 XP',
        trigger: 'concurrent_xp',
        conditions: {},
        actions: [{ type: 'award_xp', params: { amount: 150, reason: 'Concurrent' } }],
        enabled: true,
      });

      const eventIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const evtRes = await app.inject({
          method: 'POST',
          url: '/v1/events',
          headers: { 'x-api-key': apiKeySecretA },
          payload: { event: 'concurrent_xp', user_id: concurrentUser },
        });
        const bodyConc = JSON.parse(evtRes.payload);
        eventIds.push(bodyConc.id || bodyConc.eventId);
      }

      // Process jobs concurrently
      await Promise.all(eventIds.map((id) => processEventJob(id)));

      // Verify level_up notifications for concurrentUser
      const levelNotifs = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projIdA),
            eq(notifications.userId, concurrentUser),
            eq(notifications.type, 'level_up')
          )
        );

      // Verify level 2 and level 3 notifications exist without duplicates
      const level2Count = levelNotifs.filter(
        (n) => (n.data as { newLevel: number }).newLevel === 2
      ).length;
      const level3Count = levelNotifs.filter(
        (n) => (n.data as { newLevel: number }).newLevel === 3
      ).length;

      expect(level2Count).toBe(1);
      expect(level3Count).toBe(1);
    });

    it('creates achievement_unlocked notification when achievement is awarded', async () => {
      const achId = `ach_${randomUUID()}`;
      const achKey = `badge_${randomUUID()}`;
      await db.insert(achievements).values({
        id: achId,
        projectId: projIdA,
        key: achKey,
        name: 'Notif Badge',
        description: 'Test badge',
        enabled: true,
      });

      const ruleId = `rule_ach_${randomUUID()}`;
      await db.insert(rules).values({
        id: ruleId,
        projectId: projIdA,
        name: 'Award Badge',
        trigger: 'badge_trigger',
        conditions: {},
        actions: [{ type: 'award_achievement', params: { achievementKey: achKey } }],
        enabled: true,
      });

      const testUser = `usr_badge_${randomUUID()}`;
      await db.insert(endUsers).values({
        id: testUser,
        projectId: projIdA,
        externalId: testUser,
      });

      const evtRes = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecretA },
        payload: { event: 'badge_trigger', user_id: testUser },
      });
      const body = JSON.parse(evtRes.payload);
      const eventId = body.id || body.eventId;
      await processEventJob(eventId);

      const notifs = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projIdA),
            eq(notifications.userId, testUser),
            eq(notifications.type, 'achievement_unlocked')
          )
        );

      expect(notifs.length).toBe(1);
      expect(notifs[0]?.message).toContain('Notif Badge');
    });

    it('creates challenge_completed notification when challenge target is reached', async () => {
      const chId = `ch_${randomUUID()}`;
      const chKey = `ch_key_${randomUUID()}`;
      await db.insert(challenges).values({
        id: chId,
        projectId: projIdA,
        key: chKey,
        name: 'Sprint Quest',
        trigger: 'quest_event',
        target: 1,
        enabled: true,
      });

      const testUser = `usr_ch_${randomUUID()}`;
      await db.insert(endUsers).values({
        id: testUser,
        projectId: projIdA,
        externalId: testUser,
      });

      const evtRes = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecretA },
        payload: { event: 'quest_event', user_id: testUser },
      });
      const body = JSON.parse(evtRes.payload);
      const eventId = body.id || body.eventId;
      await processEventJob(eventId);

      const notifs = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projIdA),
            eq(notifications.userId, testUser),
            eq(notifications.type, 'challenge_completed')
          )
        );

      expect(notifs.length).toBe(1);
      expect(notifs[0]?.message).toContain('Sprint Quest');
    });
  });

  describe('3. Dispatcher Retry & Crash Recovery Tests', () => {
    it('dispatches pending notification outbox records cleanly', async () => {
      const notifId = `notif_clean_${randomUUID()}`;
      await db.insert(notifications).values({
        id: notifId,
        projectId: projIdA,
        userId: userIdA,
        type: 'xp_awarded',
        title: 'Clean Test',
        message: 'Clean dispatch test',
        data: {},
        sourceType: 'test',
        sourceId: `src_clean_${randomUUID()}`,
      });

      const outboxId = `nob_clean_${randomUUID()}`;
      await db.insert(notificationOutbox).values({
        id: outboxId,
        projectId: projIdA,
        notificationId: notifId,
        status: 'pending',
        attempts: 0,
      });

      const stats = await dispatchPendingNotifications(50);
      expect(stats.completedCount).toBeGreaterThan(0);
    });

    it('reclaims stale processing records during crash recovery', async () => {
      // Create a dummy notification & outbox record stuck in 'processing' 10 minutes ago
      const notifId = `notif_stale_${randomUUID()}`;
      await db.insert(notifications).values({
        id: notifId,
        projectId: projIdA,
        userId: userIdA,
        type: 'xp_awarded',
        title: 'Stale Test',
        message: 'Stale recovery',
        data: {},
        sourceType: 'test',
        sourceId: `src_stale_${randomUUID()}`,
      });

      const outboxId = `nob_stale_${randomUUID()}`;
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      await db.insert(notificationOutbox).values({
        id: outboxId,
        projectId: projIdA,
        notificationId: notifId,
        status: 'processing',
        processingAt: tenMinsAgo,
        availableAt: new Date(Date.now() - 10000),
        attempts: 1,
      });

      const stats = await dispatchPendingNotifications(50);
      expect(stats.recoveredCount).toBeGreaterThanOrEqual(1);

      const [updatedOutbox] = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId));
      expect(updatedOutbox?.status).toBe('completed');
    });

    it('marks outbox status = failed when MAX_ATTEMPTS (10) is reached', async () => {
      const notifId = `notif_max_${randomUUID()}`;
      await db.insert(notifications).values({
        id: notifId,
        projectId: projIdA,
        userId: userIdA,
        type: 'xp_awarded',
        title: 'Max Test',
        message: 'Max test',
        data: {},
        sourceType: 'test',
        sourceId: `src_max_${randomUUID()}`,
      });

      const outboxId = `nob_max_${randomUUID()}`;
      await db.insert(notificationOutbox).values({
        id: outboxId,
        projectId: projIdB, // Mismatched project ID causes delivery validation failure
        notificationId: notifId,
        status: 'pending',
        attempts: MAX_NOTIFICATION_OUTBOX_ATTEMPTS - 1, // 9 attempts
        availableAt: new Date(Date.now() - 10000),
      });

      const stats = await dispatchPendingNotifications(50);
      expect(stats.failedCount).toBeGreaterThanOrEqual(1);

      const [updatedOutbox] = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId));
      expect(updatedOutbox?.status).toBe('failed');
      expect(updatedOutbox?.attempts).toBe(MAX_NOTIFICATION_OUTBOX_ATTEMPTS);
    });
  });

  describe('4. API Endpoints & Security Tests', () => {
    it('lists user notifications with pagination and unreadCount', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projIdA}/users/${userIdA}/notifications?page=1&limit=10`,
        headers: { cookie: cookieOwnerA },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.notifications).toBeDefined();
      expect(Array.isArray(body.notifications)).toBe(true);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
      expect(typeof body.unreadCount).toBe('number');
    });

    it('returns unread count endpoint', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projIdA}/users/${userIdA}/notifications/unread-count`,
        headers: { cookie: cookieOwnerA },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.unreadCount).toBe('number');
    });

    it('marks a single notification as read', async () => {
      // Find an unread notification for userIdA
      const [unreadNotif] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.projectId, projIdA), eq(notifications.userId, userIdA)));

      expect(unreadNotif).toBeDefined();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projIdA}/users/${userIdA}/notifications/${unreadNotif.id}/read`,
        headers: { cookie: cookieOwnerA },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.readAt).not.toBeNull();
    });

    it('marks all user notifications as read', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projIdA}/users/${userIdA}/notifications/read-all`,
        headers: { cookie: cookieOwnerA },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.count).toBe('number');

      // Verify unread count is now 0
      const countRes = await app.inject({
        method: 'GET',
        url: `/api/projects/${projIdA}/users/${userIdA}/notifications/unread-count`,
        headers: { cookie: cookieOwnerA },
      });
      expect(JSON.parse(countRes.payload).unreadCount).toBe(0);
    });

    it('enforces tenant isolation preventing cross-project notification access', async () => {
      // Attempt to access Project B notifications using Project A URL
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projIdA}/users/${userIdB}/notifications`,
        headers: { cookie: cookieOwnerA },
      });

      // userIdB belongs to projIdB -> expect 404 Not Found in projIdA
      expect(res.statusCode).toBe(404);
    });
  });
});
