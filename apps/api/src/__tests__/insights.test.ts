import { randomUUID } from 'crypto';
import { db, endUsers, member, organizations, projects, rules, runMigrations } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processEventJob } from '../../../worker/src/processor.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Rule trace and user timeline', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_ins_${suffix}`;
  const projectId = `prj_ins_${suffix}`;
  const userId = `usr_ins_${suffix}`;
  const ruleId = `rule_ins_${suffix}`;
  const type = `trace_${suffix}`;

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });

  const send = async (score: number) => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKey },
      payload: { event: type, user_id: `ins_${suffix}`, payload: { score } },
    });
    return JSON.parse(res.payload).id as string;
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Insights', slug: `ins-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Insights', slug: 'insights' });
    await db.insert(endUsers).values({ id: userId, projectId, externalId: `ins_${suffix}` });
    await db.insert(rules).values({
      id: ruleId,
      projectId,
      name: 'High score',
      trigger: type,
      conditions: { field: 'payload.score', operator: 'greater_than', value: 50 },
      actions: [{ type: 'award_xp', params: { amount: 5 } }],
    });
    apiKey = (await createApiKey(projectId, 'Insights', ['*'])).rawSecret;

    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `ins_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Insights',
      },
    });
    cookie = signUp.headers['set-cookie'] as string;
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: JSON.parse(signUp.payload).user.id,
      role: 'owner',
      createdAt: new Date(),
    });

    await processEventJob(await send(80));
    await processEventJob(await send(10));
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('explains which events matched a rule', async () => {
    const res = await get(`/api/projects/${projectId}/rules/${ruleId}/trace`);
    expect(res.statusCode).toBe(200);

    const { data } = JSON.parse(res.payload);
    expect(data).toHaveLength(2);

    const matched = data.find((entry: { matched: boolean }) => entry.matched);
    const missed = data.find((entry: { matched: boolean }) => !entry.matched);
    expect(matched.execution.status).toBe('completed');
    expect(missed.reason).toContain('did not match');
    expect(missed.execution.status).toBe('skipped');
  });

  it('returns 404 for a rule in another project', async () => {
    const res = await get(`/api/projects/${projectId}/rules/rule_missing/trace`);
    expect(res.statusCode).toBe(404);
  });

  it('puts events, rule runs and XP on one timeline, without skipped runs', async () => {
    const res = await get(`/api/projects/${projectId}/users/ins_${suffix}/timeline`);
    expect(res.statusCode).toBe(200);

    const { data } = JSON.parse(res.payload);
    const kinds = data.map((entry: { kind: string }) => entry.kind);
    expect(kinds.filter((kind: string) => kind === 'event')).toHaveLength(2);
    expect(kinds.filter((kind: string) => kind === 'xp')).toHaveLength(1);
    expect(kinds.filter((kind: string) => kind === 'rule')).toHaveLength(1);
  });
});
