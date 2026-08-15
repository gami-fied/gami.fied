import { randomUUID } from 'crypto';
import { db, endUsers, rules, userXpBalances, xpLedger } from '@gami/database';
import { processEventJob } from '../../../worker/src/processor.js';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Milestone 7 — XP / Points System & End-to-End Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookieA: string;
  let orgIdA: string;
  let projIdA: string;
  let apiKeySecretA: string;

  let orgIdB: string;
  let projIdB: string;
  let apiKeySecretB: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Sign up Dashboard User A
    const emailA = `usr_xp_${randomUUID()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: emailA, password: 'SecurePassword123!', name: 'XP User A' },
    });
    cookieA = signupRes.headers['set-cookie'] as string;

    // 2. Create Org A & Project A
    const orgResA = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieA },
      payload: { name: 'XP Org A', slug: `xp-org-a-${randomUUID()}` },
    });
    const orgA = JSON.parse(orgResA.payload);
    orgIdA = orgA.id;

    const prjResA = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieA },
      payload: { organizationId: orgIdA, name: 'XP Project A', slug: `xp-prj-a-${randomUUID()}` },
    });
    const prjA = JSON.parse(prjResA.payload);
    projIdA = prjA.id;

    const keyDataA = await createApiKey(projIdA, 'Key A');
    apiKeySecretA = keyDataA.rawSecret;

    // 3. Create Org B & Project B
    const orgResB = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieA },
      payload: { name: 'XP Org B', slug: `xp-org-b-${randomUUID()}` },
    });
    const orgB = JSON.parse(orgResB.payload);
    orgIdB = orgB.id;

    const prjResB = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieA },
      payload: { organizationId: orgIdB, name: 'XP Project B', slug: `xp-prj-b-${randomUUID()}` },
    });
    const prjB = JSON.parse(prjResB.payload);
    projIdB = prjB.id;

    const keyDataB = await createApiKey(projIdB, 'Key B');
    apiKeySecretB = keyDataB.rawSecret;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Event -> Rules -> award_xp Pipeline: Awards XP atomically to end_users', async () => {
    // Create Rule A in Project A awarding 100 XP
    const ruleIdA = `r_xp_a_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdA,
      projectId: projIdA,
      name: 'Hard Task XP Rule',
      trigger: 'task.completed',
      conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
      actions: [
        {
          type: 'award_xp',
          params: { amount: 100, reason: 'Completed hard task' },
        },
      ],
      enabled: true,
    });

    // Ingest Event in Project A with target user context 'user_ext_100'
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        user_id: 'user_ext_100',
        payload: { difficulty: 'hard' },
      },
    });

    expect(ingestRes.statusCode).toBe(202);
    const eventData = JSON.parse(ingestRes.payload);

    // Resolve internal end_user ID created for user_ext_100 in Project A
    const [endUserA] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'user_ext_100')));
    expect(endUserA).toBeDefined();

    // Process event in worker
    const procRes = await processEventJob(eventData.id);
    expect(procRes.eventId).toBe(eventData.id);

    // Verify 100 XP awarded in user_xp_balances
    const [balance] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUserA.id)));
    expect(balance).toBeDefined();
    expect(balance.totalXp).toBe(100);

    // Verify 1 immutable entry in xp_ledger
    const ledgerEntries = await db
      .select()
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projIdA), eq(xpLedger.userId, endUserA.id)));
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].amount).toBe(100);
    expect(ledgerEntries[0].reason).toBe('Completed hard task');
  });

  it('2. XP Idempotency: Duplicate worker processing does NOT award XP twice', async () => {
    // Submit second event for user_ext_100
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        user_id: 'user_ext_100',
        payload: { difficulty: 'hard' },
      },
    });
    const eventData = JSON.parse(ingestRes.payload);

    // First worker pass -> awards 100 XP
    await processEventJob(eventData.id);

    const [endUserA] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'user_ext_100')));

    const [balPass1] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUserA.id)));
    expect(balPass1.totalXp).toBe(200); // 100 + 100 = 200

    // Duplicate worker retry on the SAME event -> Explicit ruleExecutionId constraint skip!
    await processEventJob(eventData.id);

    const [balPass2] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUserA.id)));
    expect(balPass2.totalXp).toBe(200); // Total XP remains 200!
  });

  it('3. Project Isolation: Same external user identity across Project A and Project B has independent XP', async () => {
    // Submit event in Project B for SAME external user identity 'user_ext_100'
    const ruleIdB = `r_xp_b_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdB,
      projectId: projIdB,
      name: 'Project B XP Rule',
      trigger: 'task.completed',
      conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
      actions: [{ type: 'award_xp', params: { amount: 50 } }],
      enabled: true,
    });

    const ingestResB = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretB },
      payload: {
        event: 'task.completed',
        user_id: 'user_ext_100',
        payload: { difficulty: 'hard' },
      },
    });

    const eventB = JSON.parse(ingestResB.payload);
    await processEventJob(eventB.id);

    const [endUserB] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdB), eq(endUsers.externalId, 'user_ext_100')));

    // Verify Project B balance is 50 XP
    const [balB] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdB), eq(userXpBalances.userId, endUserB.id)));
    expect(balB.totalXp).toBe(50);

    // Verify Project A balance remains 200 XP
    const [endUserA] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'user_ext_100')));
    const [balA] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, endUserA.id)));
    expect(balA.totalXp).toBe(200);
  });

  it('4. Manual Adjustment API & Idempotency: Owner/Admin can adjust XP with Idempotency-Key header', async () => {
    const [endUserA] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'user_ext_100')));

    const idempotencyKey = `manual_key_${Date.now()}`;

    // Submit manual adjustment (+150 XP)
    const adjustRes1 = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users/${endUserA.id}/xp/adjust`,
      headers: { cookie: cookieA, 'idempotency-key': idempotencyKey },
      payload: {
        amount: 150,
        reason: 'Bonus Reward',
      },
    });

    expect(adjustRes1.statusCode).toBe(201);
    const data1 = JSON.parse(adjustRes1.payload);
    expect(data1.duplicate).toBe(false);

    // Retry adjustment with SAME Idempotency-Key -> Returns existing adjustment entry
    const adjustRes2 = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users/${endUserA.id}/xp/adjust`,
      headers: { cookie: cookieA, 'idempotency-key': idempotencyKey },
      payload: {
        amount: 150,
        reason: 'Bonus Reward',
      },
    });

    expect(adjustRes2.statusCode).toBe(200);
    const data2 = JSON.parse(adjustRes2.payload);
    expect(data2.duplicate).toBe(true);
    expect(data2.id).toBe(data1.id);

    // Verify balance = 200 + 150 = 350 XP
    const getBalRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users/${endUserA.id}/xp`,
      headers: { cookie: cookieA },
    });
    expect(getBalRes.statusCode).toBe(200);
    expect(JSON.parse(getBalRes.payload).totalXp).toBe(350);
  });

  it('5. XP APIs: GET balance, GET ledger, and GET summary analytics endpoints return correct data', async () => {
    const [endUserA] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, 'user_ext_100')));

    // Get Ledger Endpoint
    const ledgerRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users/${endUserA.id}/xp/ledger`,
      headers: { cookie: cookieA },
    });

    expect(ledgerRes.statusCode).toBe(200);
    const ledgerData = JSON.parse(ledgerRes.payload);
    expect(ledgerData.data.length).toBeGreaterThanOrEqual(3);

    // Get Summary Analytics Endpoint
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/xp/summary`,
      headers: { cookie: cookieA },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summaryData = JSON.parse(summaryRes.payload);
    expect(summaryData.totalXpAwarded).toBe(350);
    expect(summaryData.totalUsersWithXp).toBe(1);
    expect(summaryData.topUsers).toHaveLength(1);
    expect(summaryData.topUsers[0].externalId).toBe('user_ext_100');
  });
});
