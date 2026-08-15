import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDatabaseHealth } from '../health.js';
import * as schema from '../schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDbUrl =
  process.env['DATABASE_URL_TEST'] ||
  'postgresql://gami:gami_dev_password@localhost:5432/gami_community_test';

describe('@gami/database - Core Database Schema Tests', () => {
  let testSql: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    testSql = postgres(testDbUrl, { max: 5 });
    testDb = drizzle(testSql, { schema });

    const migrationsFolder = path.resolve(__dirname, '../../drizzle/migrations');
    await migrate(testDb, { migrationsFolder });
  });

  afterAll(async () => {
    await testSql.end();
  });

  it('1. Database Health Check: returns true when PostgreSQL is reachable', async () => {
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);
  });

  it('2. Project Slug Uniqueness: rejects duplicate project slug within same org, allows same slug in different orgs', async () => {
    const org1Id = `org_${randomUUID()}`;
    const org2Id = `org_${randomUUID()}`;

    await testDb.insert(schema.organizations).values([
      { id: org1Id, name: 'Org One', slug: `org-one-${randomUUID()}` },
      { id: org2Id, name: 'Org Two', slug: `org-two-${randomUUID()}` },
    ]);

    await testDb.insert(schema.projects).values({
      id: `prj_${randomUUID()}`,
      organizationId: org1Id,
      name: 'Common Project Name',
      slug: 'my-project-slug',
    });

    await expect(
      testDb.insert(schema.projects).values({
        id: `prj_${randomUUID()}`,
        organizationId: org1Id,
        name: 'Another Project Same Slug',
        slug: 'my-project-slug',
      })
    ).rejects.toThrow();

    const [prj2] = await testDb
      .insert(schema.projects)
      .values({
        id: `prj_${randomUUID()}`,
        organizationId: org2Id,
        name: 'Project in Org 2',
        slug: 'my-project-slug',
      })
      .returning();

    expect(prj2).toBeDefined();
    expect(prj2?.slug).toBe('my-project-slug');

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, org1Id));
    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, org2Id));
  });

  it('3. End User External ID Uniqueness: rejects duplicate external_id in same project, allows in different projects', async () => {
    const orgId = `org_${randomUUID()}`;
    const prj1Id = `prj_${randomUUID()}`;
    const prj2Id = `prj_${randomUUID()}`;

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'User Test Org',
      slug: `org-usr-${randomUUID()}`,
    });

    await testDb.insert(schema.projects).values([
      { id: prj1Id, organizationId: orgId, name: 'Project A', slug: 'proj-a' },
      { id: prj2Id, organizationId: orgId, name: 'Project B', slug: 'proj-b' },
    ]);

    await testDb.insert(schema.endUsers).values({
      id: `usr_${randomUUID()}`,
      projectId: prj1Id,
      externalId: 'ext_user_777',
      name: 'User 777',
    });

    await expect(
      testDb.insert(schema.endUsers).values({
        id: `usr_${randomUUID()}`,
        projectId: prj1Id,
        externalId: 'ext_user_777',
        name: 'Duplicate User 777',
      })
    ).rejects.toThrow();

    const [usrInPrj2] = await testDb
      .insert(schema.endUsers)
      .values({
        id: `usr_${randomUUID()}`,
        projectId: prj2Id,
        externalId: 'ext_user_777',
        name: 'User 777 in Project B',
      })
      .returning();

    expect(usrInPrj2).toBeDefined();
    expect(usrInPrj2?.externalId).toBe('ext_user_777');

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  });

  it('4. Events Idempotency & Null User ID: allows NULL user_id, enforces unique idempotency_key per project', async () => {
    const orgId = `org_${randomUUID()}`;
    const prj1Id = `prj_${randomUUID()}`;
    const prj2Id = `prj_${randomUUID()}`;

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'Event Test Org',
      slug: `org-evt-${randomUUID()}`,
    });

    await testDb.insert(schema.projects).values([
      { id: prj1Id, organizationId: orgId, name: 'Project 1', slug: 'p1' },
      { id: prj2Id, organizationId: orgId, name: 'Project 2', slug: 'p2' },
    ]);

    const [nullUserEvt] = await testDb
      .insert(schema.events)
      .values({
        id: `evt_${randomUUID()}`,
        projectId: prj1Id,
        userId: null,
        type: 'system.cron',
        payload: { task: 'cleanup' },
        idempotencyKey: 'idemp_key_100',
      })
      .returning();

    expect(nullUserEvt).toBeDefined();
    expect(nullUserEvt?.userId).toBeNull();

    await expect(
      testDb.insert(schema.events).values({
        id: `evt_${randomUUID()}`,
        projectId: prj1Id,
        userId: null,
        type: 'system.cron',
        payload: { task: 'cleanup_retry' },
        idempotencyKey: 'idemp_key_100',
      })
    ).rejects.toThrow();

    const [evtInPrj2] = await testDb
      .insert(schema.events)
      .values({
        id: `evt_${randomUUID()}`,
        projectId: prj2Id,
        userId: null,
        type: 'system.cron',
        payload: { task: 'cleanup' },
        idempotencyKey: 'idemp_key_100',
      })
      .returning();

    expect(evtInPrj2).toBeDefined();
    expect(evtInPrj2?.idempotencyKey).toBe('idemp_key_100');

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  });

  it('5. JSONB Metadata & Payload Round-trip: preserves structured nested JSON data', async () => {
    const orgId = `org_${randomUUID()}`;
    const prjId = `prj_${randomUUID()}`;
    const usrId = `usr_${randomUUID()}`;

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'JSONB Test Org',
      slug: `org-jsonb-${randomUUID()}`,
    });

    await testDb.insert(schema.projects).values({
      id: prjId,
      organizationId: orgId,
      name: 'JSONB Project',
      slug: 'jsonb-project',
    });

    const sampleMetadata = {
      role: 'admin',
      permissions: ['read', 'write', 'delete'],
      preferences: { theme: 'dark', notifications: true },
    };

    await testDb.insert(schema.endUsers).values({
      id: usrId,
      projectId: prjId,
      externalId: 'ext_jsonb_usr',
      metadata: sampleMetadata,
    });

    const [fetchedUser] = await testDb
      .select()
      .from(schema.endUsers)
      .where(eq(schema.endUsers.id, usrId));

    expect(fetchedUser?.metadata).toEqual(sampleMetadata);

    const samplePayload = {
      eventSource: 'mobile_app',
      metrics: { durationSeconds: 42, score: 9850 },
      tags: ['gameplay', 'level_complete'],
    };

    const evtId = `evt_${randomUUID()}`;
    await testDb.insert(schema.events).values({
      id: evtId,
      projectId: prjId,
      userId: usrId,
      type: 'level.completed',
      payload: samplePayload,
    });

    const [fetchedEvt] = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, evtId));

    expect(fetchedEvt?.payload).toEqual(samplePayload);

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  });

  it('6. Foreign Key Deletion Behavior: end_user deletion sets events.user_id to NULL, project deletion cascades', async () => {
    const orgId = `org_${randomUUID()}`;
    const prjId = `prj_${randomUUID()}`;
    const usrId = `usr_${randomUUID()}`;
    const evtId = `evt_${randomUUID()}`;
    const apiKeyId = `key_${randomUUID()}`;
    const ruleId = `rul_${randomUUID()}`;

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'FK Test Org',
      slug: `org-fk-${randomUUID()}`,
    });

    await testDb.insert(schema.projects).values({
      id: prjId,
      organizationId: orgId,
      name: 'FK Project',
      slug: 'fk-project',
    });

    await testDb.insert(schema.endUsers).values({
      id: usrId,
      projectId: prjId,
      externalId: 'ext_fk_user',
    });

    await testDb.insert(schema.apiKeys).values({
      id: apiKeyId,
      projectId: prjId,
      name: 'FK Key',
      keyPrefix: 'gami_fk',
      keyHash: `hash_fk_${randomUUID()}`,
    });

    await testDb.insert(schema.rules).values({
      id: ruleId,
      projectId: prjId,
      name: 'FK Rule',
      trigger: 'fk.trigger',
      conditions: {},
      actions: {},
    });

    await testDb.insert(schema.events).values({
      id: evtId,
      projectId: prjId,
      userId: usrId,
      type: 'user.action',
      payload: { data: 1 },
    });

    await testDb.delete(schema.endUsers).where(eq(schema.endUsers.id, usrId));

    const [evtAfterUserDelete] = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, evtId));

    expect(evtAfterUserDelete).toBeDefined();
    expect(evtAfterUserDelete?.userId).toBeNull();

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));

    const remainingProjects = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, prjId));
    const remainingEvents = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, evtId));

    expect(remainingProjects).toHaveLength(0);
    expect(remainingEvents).toHaveLength(0);
  });
});
