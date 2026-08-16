import { randomUUID } from 'crypto';
import {
  achievements,
  challengeEventProgress,
  challengeRewardOutbox,
  checkDatabaseHealth,
  db,
  endUsers,
  events,
  member,
  organizations,
  projects,
  projectMembers,
  runMigrations,
  userAchievements,
  userChallengeProgress,
  users,
  userXpBalances,
} from '@gami/database';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import {
  dispatchPendingChallengeRewards,
  processChallengesForEvent,
} from '../../../worker/src/challenge-processor.js';
import { EventData } from '@gami/rules';

describe('Milestone 12 - Challenges & Quests E2E Integration Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  let orgId: string;
  let projectIdA: string;
  let projectIdB: string;

  let adminUserEmail: string;
  let adminCookie: string;

  let memberUserEmail: string;
  let memberCookie: string;

  let userA1: string;
  let userA2: string;
  let userB1: string;

  let challengeCounter3Id: string;

  beforeAll(async () => {
    await runMigrations();
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);

    app = await buildServer();

    // 1. Register Admin User
    adminUserEmail = `admin_ch_${randomUUID()}@example.com`;
    const regAdminRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: adminUserEmail, password: 'Password123!', name: 'Challenge Admin' },
    });
    expect(regAdminRes.statusCode).toBe(200);
    adminCookie = Array.isArray(regAdminRes.headers['set-cookie'])
      ? regAdminRes.headers['set-cookie'].join('; ')
      : regAdminRes.headers['set-cookie'] || '';

    const [dbAdminUser] = await db.select().from(users).where(eq(users.email, adminUserEmail));

    // 2. Register Member User
    memberUserEmail = `member_ch_${randomUUID()}@example.com`;
    const regMemberRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: memberUserEmail, password: 'Password123!', name: 'Challenge Member' },
    });
    expect(regMemberRes.statusCode).toBe(200);
    memberCookie = Array.isArray(regMemberRes.headers['set-cookie'])
      ? regMemberRes.headers['set-cookie'].join('; ')
      : regMemberRes.headers['set-cookie'] || '';

    const [dbMemberUser] = await db.select().from(users).where(eq(users.email, memberUserEmail));

    // 3. Create Org & Projects
    orgId = `org_ch_${randomUUID()}`;
    projectIdA = `prj_ch_a_${randomUUID()}`;
    projectIdB = `prj_ch_b_${randomUUID()}`;

    await db.insert(organizations).values({
      id: orgId,
      name: 'Challenge Test Org',
      slug: `ch-org-${randomUUID()}`,
    });

    await db.insert(member).values([
      {
        id: `mem_admin_${randomUUID()}`,
        organizationId: orgId,
        userId: dbAdminUser.id,
        role: 'owner',
      },
      {
        id: `mem_member_${randomUUID()}`,
        organizationId: orgId,
        userId: dbMemberUser.id,
        role: 'member',
      },
    ]);

    await db.insert(projects).values([
      {
        id: projectIdA,
        organizationId: orgId,
        name: 'Project Alpha',
        slug: `ch-alpha-${randomUUID()}`,
      },
      {
        id: projectIdB,
        organizationId: orgId,
        name: 'Project Beta',
        slug: `ch-beta-${randomUUID()}`,
      },
    ]);

    await db.insert(projectMembers).values({
      id: `pm_ch_${randomUUID()}`,
      projectId: projectIdA,
      userId: dbMemberUser.id,
      role: 'member',
    });

    // 4. Create Achievements in Project A
    await db.insert(achievements).values({
      id: `ach_master_${randomUUID()}`,
      projectId: projectIdA,
      key: 'challenge_master',
      name: 'Challenge Master',
      description: 'Master of Challenges',
      enabled: true,
    });

    // 5. Create End Users
    userA1 = `usr_ch_a1_${randomUUID()}`;
    userA2 = `usr_ch_a2_${randomUUID()}`;
    userB1 = `usr_ch_b1_${randomUUID()}`;

    await db.insert(endUsers).values([
      { id: userA1, projectId: projectIdA, externalId: 'ext_alice', name: 'Alice' },
      { id: userA2, projectId: projectIdA, externalId: 'ext_bob', name: 'Bob' },
      { id: userB1, projectId: projectIdB, externalId: 'ext_charlie', name: 'Charlie' },
    ]);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('1. Challenge CRUD & RBAC: owner can create, member cannot create, list & get work for member', async () => {
    // Member attempt -> 403 Forbidden
    const forbiddenRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectIdA}/challenges`,
      headers: { cookie: memberCookie },
      payload: {
        key: 'play_3_games',
        name: 'Play 3 Games',
        trigger: 'game.completed',
        target: 3,
        rewards: [
          { type: 'xp', amount: 500 },
          { type: 'achievement', achievementKey: 'challenge_master' },
        ],
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Admin attempt -> 201 Created
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectIdA}/challenges`,
      headers: { cookie: adminCookie },
      payload: {
        key: 'play_3_games',
        name: 'Play 3 Games',
        description: 'Complete 3 matches to earn rewards',
        trigger: 'game.completed',
        target: 3,
        rewards: [
          { type: 'xp', amount: 500 },
          { type: 'achievement', achievementKey: 'challenge_master' },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.key).toBe('play_3_games');
    expect(body.target).toBe(3);
    challengeCounter3Id = body.id;

    // Member list -> 200 OK
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectIdA}/challenges`,
      headers: { cookie: memberCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.length).toBe(1);
  });

  it('2. Test 1 — Duplicate Event: Retrying same event increments progress exactly once', async () => {
    const eventId = `evt_dup_${randomUUID()}`;
    await db.insert(events).values({
      id: eventId,
      projectId: projectIdA,
      userId: userA1,
      type: 'game.completed',
      payload: {},
    });

    const eventData: EventData = {
      id: eventId,
      projectId: projectIdA,
      userId: userA1,
      type: 'game.completed',
      payload: {},
    };

    // First processing run
    const run1 = await processChallengesForEvent(eventData);
    expect(run1.processedChallengesCount).toBe(1);

    // Verify progress = 1
    const [p1] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, userA1),
          eq(userChallengeProgress.challengeId, challengeCounter3Id)
        )
      );
    expect(p1.progress).toBe(1);
    expect(p1.completed).toBe(false);

    // Second processing run (Duplicate Event Retry)
    const run2 = await processChallengesForEvent(eventData);
    expect(run2.processedChallengesCount).toBe(0);

    // Verify progress remains 1
    const [p2] = await db
      .select()
      .from(userChallengeProgress)
      .where(eq(userChallengeProgress.id, p1.id));
    expect(p2.progress).toBe(1);

    // Verify exactly 1 row in challenge_event_progress
    const cepRows = await db
      .select()
      .from(challengeEventProgress)
      .where(
        and(
          eq(challengeEventProgress.projectId, projectIdA),
          eq(challengeEventProgress.challengeId, challengeCounter3Id),
          eq(challengeEventProgress.eventId, eventId)
        )
      );
    expect(cepRows.length).toBe(1);
  });

  it('3. Test 2 — Out-of-Order Duplicate: Event A, Event B, Event A', async () => {
    const eventAId = `evt_ooo_a_${randomUUID()}`;
    const eventBId = `evt_ooo_b_${randomUUID()}`;

    await db.insert(events).values([
      { id: eventAId, projectId: projectIdA, userId: userA2, type: 'game.completed', payload: {} },
      { id: eventBId, projectId: projectIdA, userId: userA2, type: 'game.completed', payload: {} },
    ]);

    const eventAData: EventData = {
      id: eventAId,
      projectId: projectIdA,
      userId: userA2,
      type: 'game.completed',
      payload: {},
    };
    const eventBData: EventData = {
      id: eventBId,
      projectId: projectIdA,
      userId: userA2,
      type: 'game.completed',
      payload: {},
    };

    // Process Event A -> progress 1
    await processChallengesForEvent(eventAData);
    // Process Event B -> progress 2
    await processChallengesForEvent(eventBData);
    // Process Event A again (out-of-order duplicate retry) -> should be no-op!
    await processChallengesForEvent(eventAData);

    const [p] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, userA2),
          eq(userChallengeProgress.challengeId, challengeCounter3Id)
        )
      );
    expect(p.progress).toBe(2);

    const cepRows = await db
      .select()
      .from(challengeEventProgress)
      .where(
        and(
          eq(challengeEventProgress.projectId, projectIdA),
          eq(challengeEventProgress.challengeId, challengeCounter3Id),
          eq(challengeEventProgress.userId, userA2)
        )
      );
    expect(cepRows.length).toBe(2);
  });

  it('4. Test 3 — Concurrent Duplicate: Processing same event concurrently from multiple workers', async () => {
    const userConc = `usr_conc_${randomUUID()}`;
    await db
      .insert(endUsers)
      .values({ id: userConc, projectId: projectIdA, externalId: 'ext_conc', name: 'Concurrent' });

    const concEventId = `evt_conc_dup_${randomUUID()}`;
    await db.insert(events).values({
      id: concEventId,
      projectId: projectIdA,
      userId: userConc,
      type: 'game.completed',
      payload: {},
    });

    const concEventData: EventData = {
      id: concEventId,
      projectId: projectIdA,
      userId: userConc,
      type: 'game.completed',
      payload: {},
    };

    // Trigger 3 concurrent calls of processChallengesForEvent for exact same event
    await Promise.all([
      processChallengesForEvent(concEventData),
      processChallengesForEvent(concEventData),
      processChallengesForEvent(concEventData),
    ]);

    const [p] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, userConc),
          eq(userChallengeProgress.challengeId, challengeCounter3Id)
        )
      );
    expect(p.progress).toBe(1);

    const cepRows = await db
      .select()
      .from(challengeEventProgress)
      .where(eq(challengeEventProgress.eventId, concEventId));
    expect(cepRows.length).toBe(1);
  });

  it('5. Test 4 — Concurrent Different Events: Processing distinct events concurrently increments progress +2 with FOR UPDATE', async () => {
    const userDiff = `usr_diff_${randomUUID()}`;
    await db
      .insert(endUsers)
      .values({ id: userDiff, projectId: projectIdA, externalId: 'ext_diff', name: 'Diff' });

    await db.insert(userChallengeProgress).values({
      id: `ucp_diff_${randomUUID()}`,
      projectId: projectIdA,
      userId: userDiff,
      challengeId: challengeCounter3Id,
      progress: 0,
      completed: false,
    });

    const evt1Id = `evt_diff_1_${randomUUID()}`;
    const evt2Id = `evt_diff_2_${randomUUID()}`;

    await db.insert(events).values([
      { id: evt1Id, projectId: projectIdA, userId: userDiff, type: 'game.completed', payload: {} },
      { id: evt2Id, projectId: projectIdA, userId: userDiff, type: 'game.completed', payload: {} },
    ]);

    const evt1Data: EventData = {
      id: evt1Id,
      projectId: projectIdA,
      userId: userDiff,
      type: 'game.completed',
      payload: {},
    };
    const evt2Data: EventData = {
      id: evt2Id,
      projectId: projectIdA,
      userId: userDiff,
      type: 'game.completed',
      payload: {},
    };

    // Execute concurrently
    await Promise.all([processChallengesForEvent(evt1Data), processChallengesForEvent(evt2Data)]);

    const [p] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, userDiff),
          eq(userChallengeProgress.challengeId, challengeCounter3Id)
        )
      );
    expect(p.progress).toBe(2);
  });

  it('6. Test 5 & 6 — Challenge Completion & Completion Retry: triggers rewards post-commit and retry is idempotent', async () => {
    // Continue userA1 from progress 1 -> process 2 more events
    const evt2Id = `evt_comp_2_${randomUUID()}`;
    const evt3Id = `evt_comp_3_${randomUUID()}`;

    await db.insert(events).values([
      { id: evt2Id, projectId: projectIdA, userId: userA1, type: 'game.completed', payload: {} },
      { id: evt3Id, projectId: projectIdA, userId: userA1, type: 'game.completed', payload: {} },
    ]);

    const evt2Data: EventData = {
      id: evt2Id,
      projectId: projectIdA,
      userId: userA1,
      type: 'game.completed',
      payload: {},
    };
    const evt3Data: EventData = {
      id: evt3Id,
      projectId: projectIdA,
      userId: userA1,
      type: 'game.completed',
      payload: {},
    };

    await processChallengesForEvent(evt2Data); // progress 2
    const res3 = await processChallengesForEvent(evt3Data); // progress 3 -> completed!
    expect(res3.completedChallengesCount).toBe(1);

    const [pCompleted] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, userA1),
          eq(userChallengeProgress.challengeId, challengeCounter3Id)
        )
      );
    expect(pCompleted.progress).toBe(3);
    expect(pCompleted.completed).toBe(true);
    expect(pCompleted.completedAt).not.toBeNull();

    // Dispatch pending challenge rewards outbox
    await dispatchPendingChallengeRewards(50);

    // Check XP reward awarded
    const [xpBal] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projectIdA), eq(userXpBalances.userId, userA1)));
    expect(xpBal).toBeDefined();
    expect(xpBal.totalXp).toBe(500);

    // Check Achievement reward awarded
    const userAchs = await db
      .select()
      .from(userAchievements)
      .where(and(eq(userAchievements.projectId, projectIdA), eq(userAchievements.userId, userA1)));
    expect(userAchs.length).toBe(1);

    // Test 6: Completion Retry (Retrying evt3Data)
    const retryRes = await processChallengesForEvent(evt3Data);
    expect(retryRes.processedChallengesCount).toBe(0);

    // XP remains 500
    const [xpBalRetry] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projectIdA), eq(userXpBalances.userId, userA1)));
    expect(xpBalRetry.totalXp).toBe(500);
  });

  it('7. Test 8 & 9 — Tenant Isolation & Null User ID Guard', async () => {
    // Null user ID guard
    const nullUserEvtData: EventData = {
      id: `evt_null_${randomUUID()}`,
      projectId: projectIdA,
      userId: '',
      type: 'game.completed',
      payload: {},
    };
    const nullRes = await processChallengesForEvent(nullUserEvtData);
    expect(nullRes.processedChallengesCount).toBe(0);

    // Tenant Isolation: Event for Project B does not update Project A user
    const evtBId = `evt_proj_b_${randomUUID()}`;
    await db.insert(events).values({
      id: evtBId,
      projectId: projectIdB,
      userId: userB1,
      type: 'game.completed',
      payload: {},
    });

    const evtBData: EventData = {
      id: evtBId,
      projectId: projectIdB,
      userId: userB1,
      type: 'game.completed',
      payload: {},
    };
    await processChallengesForEvent(evtBData);

    // Project B user has no progress on Project A challenge
    const progB = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdB),
          eq(userChallengeProgress.userId, userB1)
        )
      );
    expect(progB.length).toBe(0);
  });

  it('8. User Progress API & Summary API', async () => {
    // User progress list endpoint
    const userProgRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectIdA}/users/${userA1}/challenges`,
      headers: { cookie: adminCookie },
    });
    expect(userProgRes.statusCode).toBe(200);
    const userProgBody = JSON.parse(userProgRes.body);
    expect(userProgBody.userId).toBe(userA1);
    expect(userProgBody.challenges.length).toBe(1);
    expect(userProgBody.challenges[0].completed).toBe(true);
    expect(userProgBody.challenges[0].percent).toBe(100);

    // Summary endpoint
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectIdA}/challenges/summary`,
      headers: { cookie: adminCookie },
    });
    expect(summaryRes.statusCode).toBe(200);
    const summaryBody = JSON.parse(summaryRes.body);
    expect(summaryBody.totalChallenges).toBe(1);
    expect(summaryBody.enabledChallenges).toBe(1);
    expect(summaryBody.totalCompletedInstances).toBe(1);
  });

  it('9. Worker Crash Recovery: Challenge completion transaction commits outbox record; simulated crash leaves status pending; dispatcher achieves exactly-once effects through idempotent processing', async () => {
    const crashUserId = `usr_crash_${randomUUID()}`;
    await db.insert(endUsers).values({
      id: crashUserId,
      projectId: projectIdA,
      externalId: 'ext_crash',
      name: 'Crash User',
    });

    // Create a 1-target challenge with snapshotted rewards
    const chCrashRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectIdA}/challenges`,
      headers: { cookie: adminCookie },
      payload: {
        key: `crash_ch_${randomUUID().slice(0, 8)}`,
        name: 'Crash Recovery Challenge',
        trigger: 'crash.event',
        target: 1,
        rewards: [
          { type: 'xp', amount: 750 },
          { type: 'achievement', achievementKey: 'challenge_master' },
        ],
      },
    });
    expect(chCrashRes.statusCode).toBe(201);
    const chCrash = JSON.parse(chCrashRes.body);

    const crashEvtId = `evt_crash_${randomUUID()}`;
    await db.insert(events).values({
      id: crashEvtId,
      projectId: projectIdA,
      userId: crashUserId,
      type: 'crash.event',
      payload: {},
    });

    const crashEvtData: EventData = {
      id: crashEvtId,
      projectId: projectIdA,
      userId: crashUserId,
      type: 'crash.event',
      payload: {},
    };

    // Process event WITH skipImmediateRewardDispatch = true (simulating worker crash right after progress tx commit)
    const procRes = await processChallengesForEvent(crashEvtData, {
      skipImmediateRewardDispatch: true,
    });
    expect(procRes.completedChallengesCount).toBe(1);

    // Verify user_challenge_progress is completed = true
    const [crashProg] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectIdA),
          eq(userChallengeProgress.userId, crashUserId),
          eq(userChallengeProgress.challengeId, chCrash.id)
        )
      );
    expect(crashProg.completed).toBe(true);

    // Verify pending outbox records exist in challenge_reward_outbox
    const pendingOutboxRows = await db
      .select()
      .from(challengeRewardOutbox)
      .where(
        and(
          eq(challengeRewardOutbox.projectId, projectIdA),
          eq(challengeRewardOutbox.userId, crashUserId),
          eq(challengeRewardOutbox.challengeId, chCrash.id)
        )
      );
    expect(pendingOutboxRows.length).toBe(2);
    expect(pendingOutboxRows.every((r) => r.status === 'pending')).toBe(true);

    // Verify XP balance is currently 0 before outbox dispatch
    const [xpBefore] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projectIdA), eq(userXpBalances.userId, crashUserId)));
    expect(xpBefore).toBeUndefined();

    // Now run recovery dispatcher
    const dispatchRes = await dispatchPendingChallengeRewards(50, new Date(Date.now() + 60000));
    expect(dispatchRes.completedCount).toBeGreaterThanOrEqual(2);

    // Verify outbox records status updated to 'completed'
    const completedOutboxRows = await db
      .select()
      .from(challengeRewardOutbox)
      .where(
        and(
          eq(challengeRewardOutbox.projectId, projectIdA),
          eq(challengeRewardOutbox.userId, crashUserId),
          eq(challengeRewardOutbox.challengeId, chCrash.id)
        )
      );
    expect(completedOutboxRows.every((r) => r.status === 'completed')).toBe(true);

    // Verify XP awarded exactly once
    const [xpAfter] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projectIdA), eq(userXpBalances.userId, crashUserId)));
    expect(xpAfter).toBeDefined();
    expect(xpAfter.totalXp).toBe(750);

    // Re-run dispatcher to verify idempotency (no double-awards)
    await dispatchPendingChallengeRewards(50);

    const [xpRetry] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projectIdA), eq(userXpBalances.userId, crashUserId)));
    expect(xpRetry.totalXp).toBe(750);
  });

  it('10. Dispatcher Retry & Backoff: outbox processing records attempts and availableAt backoff on failure', async () => {
    const errUserId = `usr_err_${randomUUID()}`;
    await db
      .insert(endUsers)
      .values({ id: errUserId, projectId: projectIdA, externalId: 'ext_err', name: 'Error User' });

    const fakeEvtId = `evt_fake_${randomUUID()}`;
    await db.insert(events).values({
      id: fakeEvtId,
      projectId: projectIdA,
      userId: errUserId,
      type: 'fake.event',
      payload: {},
    });

    const outboxId = `cro_err_${randomUUID()}`;
    const pastAvailable = new Date(Date.now() - 10000);

    // Insert an invalid outbox record that causes processing error (e.g. invalid rewardType or payload)
    await db.insert(challengeRewardOutbox).values({
      id: outboxId,
      projectId: projectIdA,
      challengeId: challengeCounter3Id,
      userId: errUserId,
      eventId: fakeEvtId,
      rewardType: 'invalid_type',
      rewardPayload: {},
      status: 'pending',
      attempts: 0,
      availableAt: pastAvailable,
    });

    // Dispatcher run -> fails processing invalid_type
    await dispatchPendingChallengeRewards(50, new Date(Date.now() + 1000));

    const [failedRecord] = await db
      .select()
      .from(challengeRewardOutbox)
      .where(eq(challengeRewardOutbox.id, outboxId));

    expect(failedRecord).toBeDefined();
    expect(failedRecord?.status).toBe('pending');
    expect(failedRecord?.attempts).toBe(1);
    expect(failedRecord?.lastError).toBeDefined();
    expect(failedRecord?.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('11. Multi-Worker Concurrent Dispatch: FOR UPDATE SKIP LOCKED prevents collisions across concurrent workers', async () => {
    const concUserId = `usr_conc_disp_${randomUUID()}`;
    await db.insert(endUsers).values({
      id: concUserId,
      projectId: projectIdA,
      externalId: 'ext_conc_disp',
      name: 'Concurrent Dispatch User',
    });

    // Create 5 pending outbox records
    const outboxIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `cro_conc_${i}_${randomUUID()}`;
      outboxIds.push(id);

      const evtId = `evt_conc_${i}_${randomUUID()}`;
      await db.insert(events).values({
        id: evtId,
        projectId: projectIdA,
        userId: concUserId,
        type: 'conc.event',
        payload: {},
      });

      await db.insert(challengeRewardOutbox).values({
        id,
        projectId: projectIdA,
        challengeId: challengeCounter3Id,
        userId: concUserId,
        eventId: evtId,
        rewardType: 'xp',
        rewardPayload: { amount: 100 },
        status: 'pending',
        availableAt: new Date(),
      });
    }

    // Execute 3 concurrent dispatcher workers simultaneously
    await Promise.all([
      dispatchPendingChallengeRewards(10),
      dispatchPendingChallengeRewards(10),
      dispatchPendingChallengeRewards(10),
    ]);

    // Verify all 5 records are marked completed without collisions
    const rows = await db
      .select()
      .from(challengeRewardOutbox)
      .where(
        and(
          eq(challengeRewardOutbox.projectId, projectIdA),
          eq(challengeRewardOutbox.userId, concUserId)
        )
      );

    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });
});
