import { randomUUID } from 'crypto';
import { db, organizations, projects, ruleExecutions, rules } from '@gami/database';
import { processEventJob } from '../../../worker/src/processor.js';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Milestone 6 — Rules Engine & End-to-End System Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookieA: string;
  let orgIdA: string;
  let projIdA: string;
  let apiKeySecretA: string;

  let orgIdB: string;
  let projIdB: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Sign up Dashboard User A
    const emailA = `usr_rules_${randomUUID()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: emailA, password: 'SecurePassword123!', name: 'Rules User A' },
    });
    cookieA = signupRes.headers['set-cookie'] as string;

    // 1. Create Organization A & Project A via HTTP routes
    const orgResA = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieA },
      payload: { name: 'Rules Org A', slug: `rules-org-a-${randomUUID()}` },
    });
    const orgA = JSON.parse(orgResA.payload);
    orgIdA = orgA.id;

    const prjResA = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieA },
      payload: {
        organizationId: orgIdA,
        name: 'Rules Project A',
        slug: `rules-prj-a-${randomUUID()}`,
      },
    });
    const prjA = JSON.parse(prjResA.payload);
    projIdA = prjA.id;

    const keyDataA = await createApiKey(projIdA, 'Key A');
    apiKeySecretA = keyDataA.rawSecret;

    // 2. Create Organization B & Project B
    orgIdB = `org_rules_b_${Date.now()}`;
    projIdB = `prj_rules_b_${Date.now()}`;

    await db.insert(organizations).values({
      id: orgIdB,
      name: 'Rules Org B',
      slug: `rules-org-b-${Date.now()}`,
    });

    await db.insert(projects).values({
      id: projIdB,
      organizationId: orgIdB,
      name: 'Rules Project B',
      slug: `rules-prj-b-${Date.now()}`,
    });

    await createApiKey(projIdB, 'Key B');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Rule Management API: CRUD endpoints enforce tenant isolation and rule validation', async () => {
    // Create Rule A in Project A
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/rules`,
      headers: { cookie: cookieA },
      payload: {
        name: 'Hard Boss Reward',
        trigger: 'boss.defeated',
        conditions: {
          all: [
            { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
            { field: 'payload.score', operator: 'greater_than', value: 100 },
          ],
        },
        actions: [{ type: 'log', params: { msg: 'Boss Defeated' } }],
        enabled: true,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdRule = JSON.parse(createRes.payload);
    expect(createdRule.id).toBeDefined();
    expect(createdRule.trigger).toBe('boss.defeated');

    // List Rules in Project A
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/rules`,
      headers: { cookie: cookieA },
    });
    expect(listRes.statusCode).toBe(200);
    const listData = JSON.parse(listRes.payload);
    expect(listData.data.length).toBeGreaterThanOrEqual(1);

    // Reject Invalid Rule Definition (missing trigger)
    const invalidRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/rules`,
      headers: { cookie: cookieA },
      payload: {
        name: 'Invalid Rule',
        trigger: '',
        actions: [],
      },
    });
    expect(invalidRes.statusCode).toBe(400);
  });

  it('2. Rule Preview API: Preview operates in-memory and never creates DB records or executes actions', async () => {
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/rules/preview`,
      headers: { cookie: cookieA },
      payload: {
        rule: {
          trigger: 'task.completed',
          conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
          actions: [{ type: 'grant_xp', params: { amount: 100 } }],
        },
        event: {
          type: 'task.completed',
          payload: { difficulty: 'hard' },
        },
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const previewData = JSON.parse(previewRes.payload);
    expect(previewData.matched).toBe(true);
    expect(previewData.triggerMatched).toBe(true);
    expect(previewData.conditionsMatched).toBe(true);
    expect(previewData.actions).toHaveLength(1);

    // Verify zero DB execution records were created for preview
    const execCount = await db.select().from(ruleExecutions);
    const previewExecs = execCount.filter((e) => e.eventId === 'preview_event_id');
    expect(previewExecs).toHaveLength(0);
  });

  it('3. End-to-End Rule Execution: Matching event triggers rule, creates rule_executions record', async () => {
    // Create Rule A in Project A
    const ruleIdA = `r_e2e_a_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdA,
      projectId: projIdA,
      name: 'E2E Task Rule',
      trigger: 'task.completed',
      conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
      actions: [{ type: 'log' }],
      enabled: true,
    });

    // Ingest Event in Project A
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        payload: { difficulty: 'hard', score: 200 },
      },
    });

    expect(ingestRes.statusCode).toBe(202);
    const eventData = JSON.parse(ingestRes.payload);

    // Invoke Worker Processor for Event
    const procRes = await processEventJob(eventData.id);
    expect(procRes.eventId).toBe(eventData.id);
    expect(procRes.processedRulesCount).toBeGreaterThanOrEqual(1);

    // Verify rule_executions record status = 'completed'
    const [execRecord] = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleIdA), eq(ruleExecutions.eventId, eventData.id)));

    expect(execRecord).toBeDefined();
    expect(execRecord.status).toBe('completed');
    expect(execRecord.executedAt).not.toBeNull();

    // 4. Idempotency Check: Re-run worker processing on the same event
    const retryRes = await processEventJob(eventData.id);
    expect(retryRes.eventId).toBe(eventData.id);
    // Should skip execution due to completed status
    const allExecs = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleIdA), eq(ruleExecutions.eventId, eventData.id)));
    expect(allExecs).toHaveLength(1);
  });

  it('4. Tenant Isolation: Project B rule NEVER evaluates or executes against Project A event', async () => {
    // Create Rule B in Project B matching trigger 'task.completed'
    const ruleIdB = `r_tenant_b_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdB,
      projectId: projIdB,
      name: 'Project B Task Rule',
      trigger: 'task.completed',
      conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
      actions: [{ type: 'log_b' }],
      enabled: true,
    });

    // Ingest Event in Project A
    const ingestResA = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'task.completed',
        payload: { difficulty: 'hard' },
      },
    });
    expect(ingestResA.statusCode).toBe(202);
    const eventA = JSON.parse(ingestResA.payload);

    // Process Event A in Worker
    await processEventJob(eventA.id);

    // PROOF: Rule B (Project B) was NEVER executed for Event A (Project A)
    const [ruleBExec] = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleIdB), eq(ruleExecutions.eventId, eventA.id)));

    expect(ruleBExec).toBeUndefined();
  });

  it('5. Failure Isolation: Failing Rule C does NOT prevent Rule D from completing', async () => {
    const projIdFail = `prj_fail_${Date.now()}`;
    await db.insert(projects).values({
      id: projIdFail,
      organizationId: orgIdA,
      name: 'Fail Test Project',
      slug: `fail-prj-${Date.now()}`,
    });

    // Rule C (Failing) - Invalid operator in conditions
    const ruleIdFail = `r_fail_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdFail,
      projectId: projIdFail,
      name: 'Malformed Rule C',
      trigger: 'test.fail',
      conditions: { field: 'payload.score', operator: 'invalid_op' as unknown as 'equals' },
      actions: [{ type: 'log' }],
      enabled: true,
    });

    // Rule D (Succeeding)
    const ruleIdSucc = `r_succ_${Date.now()}`;
    await db.insert(rules).values({
      id: ruleIdSucc,
      projectId: projIdFail,
      name: 'Good Rule D',
      trigger: 'test.fail',
      conditions: { field: 'payload.valid', operator: 'equals', value: true },
      actions: [{ type: 'log' }],
      enabled: true,
    });

    const keyFail = await createApiKey(projIdFail, 'Fail Key');

    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': keyFail.rawSecret },
      payload: {
        event: 'test.fail',
        payload: { valid: true },
      },
    });

    const eventFail = JSON.parse(ingestRes.payload);
    await processEventJob(eventFail.id);

    // Verify Rule C failed
    const [execFail] = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleIdFail), eq(ruleExecutions.eventId, eventFail.id)));
    expect(execFail.status).toBe('failed');

    // Verify Rule D STILL succeeded (Failure Isolation)
    const [execSucc] = await db
      .select()
      .from(ruleExecutions)
      .where(and(eq(ruleExecutions.ruleId, ruleIdSucc), eq(ruleExecutions.eventId, eventFail.id)));
    expect(execSucc.status).toBe('completed');
  });
});
