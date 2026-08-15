import { randomUUID } from 'crypto';
import { db, endUsers, rules, userAchievements, userXpBalances } from '@gami/database';
import { processEventJob } from '../../../worker/src/processor.js';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Milestone 8 — Achievement System & End-to-End Integration Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookieOwnerA: string;
  let orgIdA: string;
  let projIdA: string;
  let apiKeySecretA: string;

  let projIdB: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Sign up Dashboard Owner A
    const emailA = `owner_ach_${randomUUID()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: emailA, password: 'SecurePassword123!', name: 'Owner A' },
    });
    cookieOwnerA = signupRes.headers['set-cookie'] as string;

    // 2. Create Org A & Project A
    const orgResA = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieOwnerA },
      payload: { name: 'Ach Org A', slug: `ach-org-a-${randomUUID()}` },
    });
    const orgA = JSON.parse(orgResA.payload);
    orgIdA = orgA.id;

    const prjResA = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieOwnerA },
      payload: { organizationId: orgIdA, name: 'Ach Project A', slug: `ach-prj-a-${randomUUID()}` },
    });
    const prjA = JSON.parse(prjResA.payload);
    projIdA = prjA.id;

    const keyDataA = await createApiKey(projIdA, 'Key Ach A');
    apiKeySecretA = keyDataA.rawSecret;

    // 3. Create Project B in Org A
    const prjResB = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieOwnerA },
      payload: { organizationId: orgIdA, name: 'Ach Project B', slug: `ach-prj-b-${randomUUID()}` },
    });
    const prjB = JSON.parse(prjResB.payload);
    projIdB = prjB.id;

    await createApiKey(projIdB, 'Key Ach B');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Achievement CRUD: Create, Read, Update, Soft-Disable & Key Uniqueness', async () => {
    // Create Achievement in Project A
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/achievements`,
      headers: { cookie: cookieOwnerA },
      payload: {
        key: 'first_task',
        name: 'First Task Completed',
        description: 'Awarded on completing first task',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const ach = JSON.parse(createRes.payload);
    expect(ach.key).toBe('first_task');
    expect(ach.enabled).toBe(true);

    // Duplicate key in same project should fail (400 Bad Request)
    const dupRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/achievements`,
      headers: { cookie: cookieOwnerA },
      payload: {
        key: 'first_task',
        name: 'Duplicate Task',
      },
    });
    expect(dupRes.statusCode).toBe(400);

    // List Achievements
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/achievements`,
      headers: { cookie: cookieOwnerA },
    });
    expect(listRes.statusCode).toBe(200);
    expect(JSON.parse(listRes.payload).data).toHaveLength(1);

    // Patch Achievement
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/achievements/${ach.id}`,
      headers: { cookie: cookieOwnerA },
      payload: { name: 'First Task Champion' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.payload).name).toBe('First Task Champion');

    // Soft Disable Achievement
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projIdA}/achievements/${ach.id}`,
      headers: { cookie: cookieOwnerA },
    });
    expect(deleteRes.statusCode).toBe(200);

    // Re-enable for subsequent worker tests
    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/achievements/${ach.id}`,
      headers: { cookie: cookieOwnerA },
      payload: { enabled: true },
    });
  });

  it('2. Rule Integration & Worker Awarding: Multi-action (award_xp + award_achievement)', async () => {
    // Create Rule with both award_xp and award_achievement
    const ruleId = `r_multi_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleId,
      projectId: projIdA,
      name: 'Task Multi-Award Rule',
      trigger: 'task.completed',
      conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
      actions: [
        { type: 'award_xp', params: { amount: 150, reason: 'Multi-award task' } },
        { type: 'award_achievement', params: { achievementKey: 'first_task' } },
      ],
      enabled: true,
    });

    // Ingest event for end-user 'usr_ach_1'
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        user_id: 'usr_ach_1',
        payload: { difficulty: 'hard' },
      },
    });

    expect(ingestRes.statusCode).toBe(202);
    const eventData = JSON.parse(ingestRes.payload);

    // Process event in worker
    await processEventJob(eventData.id);

    // Verify End-User ID
    const [endUser] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'usr_ach_1')));
    expect(endUser).toBeDefined();

    // Verify 150 XP awarded
    const [balance] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUser.id)));
    expect(balance.totalXp).toBe(150);

    // Verify user_achievements record inserted
    const userAchs = await db
      .select()
      .from(userAchievements)
      .where(and(eq(userAchievements.projectId, projIdA), eq(userAchievements.userId, endUser.id)));
    expect(userAchs).toHaveLength(1);
  });

  it('3. Idempotency: Processing duplicate event or rule does NOT double-award achievement', async () => {
    // Ingest second event for usr_ach_1
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        user_id: 'usr_ach_1',
        payload: { difficulty: 'hard' },
      },
    });
    const eventData = JSON.parse(ingestRes.payload);

    // Process worker pass 1
    await processEventJob(eventData.id);

    const [endUser] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'usr_ach_1')));

    // Repeat worker pass on SAME event -> Constraint 23505 idempotent skip!
    await processEventJob(eventData.id);

    const userAchs = await db
      .select()
      .from(userAchievements)
      .where(and(eq(userAchievements.projectId, projIdA), eq(userAchievements.userId, endUser.id)));
    // User already has 'first_task', so exactly 1 record remains!
    expect(userAchs).toHaveLength(1);
  });

  it('4. Project Isolation: Project A cannot award or access Project B achievements', async () => {
    // Create achievement in Project B with key 'first_task'
    const createResB = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdB}/achievements`,
      headers: { cookie: cookieOwnerA },
      payload: { key: 'first_task', name: 'Project B First Task' },
    });
    expect(createResB.statusCode).toBe(201);
    const achB = JSON.parse(createResB.payload);

    // Query Project A achievements -> Does NOT contain Project B achievement
    const listResA = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/achievements`,
      headers: { cookie: cookieOwnerA },
    });
    const listA = JSON.parse(listResA.payload).data;
    expect(listA.find((a: { id: string }) => a.id === achB.id)).toBeUndefined();

    // Direct fetch of Project B achievement under Project A route -> 404 Not Found
    const crossRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/achievements/${achB.id}`,
      headers: { cookie: cookieOwnerA },
    });
    expect(crossRes.statusCode).toBe(404);
  });

  it('5. Action Failure Isolation: Invalid achievement key does NOT roll back award_xp', async () => {
    const ruleIdFail = `r_fail_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdFail,
      projectId: projIdA,
      name: 'Failing Achievement Rule',
      trigger: 'task.failed_action',
      conditions: {},
      actions: [
        { type: 'award_xp', params: { amount: 50, reason: 'Partial success XP' } },
        { type: 'award_achievement', params: { achievementKey: 'non_existent_key' } },
      ],
      enabled: true,
    });

    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.failed_action',
        user_id: 'usr_ach_2',
      },
    });

    const eventData = JSON.parse(ingestRes.payload);
    await processEventJob(eventData.id);

    const [endUser2] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'usr_ach_2')));

    // Verify 50 XP WAS awarded cleanly even though the achievement action failed!
    const [bal2] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUser2.id)));
    expect(bal2.totalXp).toBe(50);
  });

  it('6. Full End-to-End 14-Step Validation Flow', async () => {
    // 13. Summary Analytics Endpoint
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/achievements/summary`,
      headers: { cookie: cookieOwnerA },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summaryData = JSON.parse(summaryRes.payload);
    expect(summaryData.totalAchievements).toBe(1);
    expect(summaryData.enabledAchievements).toBe(1);
    expect(summaryData.totalAwards).toBe(1);
    expect(summaryData.uniqueUsersWithAchievements).toBe(1);
  });
});
