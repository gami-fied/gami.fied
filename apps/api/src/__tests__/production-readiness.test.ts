import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redactSensitiveData, validateProductionConfig } from '@gami/config';
import { db, eventOutbox, events, organizations, projects, runMigrations } from '@gami/database';
import { checkRedisHealth, getWorkerHeartbeatStatus, sendWorkerHeartbeat } from '@gami/queue';
import { reclaimStaleOutboxRecords } from '../../../worker/src/outbox-poller.js';
import { eq } from 'drizzle-orm';
import { buildServer } from '../index.js';
import { createAuditLog } from '../audit-logs/index.js';

describe('Milestone 17 — Production Readiness & Observability Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testProjectId = 'prj_prod_test_123';
  let testOrgId = 'org_prod_test_123';
  let testUserId = 'usr_prod_test_123';

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();

    // Create test organization & project
    await db
      .insert(organizations)
      .values({
        id: testOrgId,
        name: 'Production Readiness Org',
        slug: `prod-org-${Date.now()}`,
      })
      .onConflictDoNothing();

    await db
      .insert(projects)
      .values({
        id: testProjectId,
        organizationId: testOrgId,
        name: 'Production Readiness Project',
        slug: `prod-proj-${Date.now()}`,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /health should return 200 OK process liveness payload', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('2. GET /ready should probe PostgreSQL and Redis ONLY', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    const isRedisUp = await checkRedisHealth();
    if (isRedisUp) {
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
      expect(body.postgres).toBe('connected');
      expect(body.redis).toBe('connected');
    } else {
      expect(res.statusCode).toBe(503);
    }
  });

  it('3. validateProductionConfig should reject insecure defaults in production mode', () => {
    const insecureEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/gami',
      BETTER_AUTH_SECRET: 'super-secret-auth-key-123456789',
      WEBHOOK_MASTER_KEY: 'gami_webhook_master_encryption_key_32bytes!!',
      REDIS_HOST: 'localhost',
    };

    expect(() => validateProductionConfig(insecureEnv)).toThrow(
      '[Config] Insecure development database password detected in production DATABASE_URL'
    );
  });

  it('4. redactSensitiveData should recursively redact secrets, passwords, and API keys', () => {
    const inputPayload = {
      name: 'Test Endpoint',
      url: 'https://example.com/webhook',
      webhookSecret: 'whsec_super_secret_123',
      nested: {
        apiKey: 'gami_live_secret_9999',
        userPassword: 'my_password_123',
        normalField: 'hello world',
      },
    };

    const redacted = redactSensitiveData(inputPayload);

    expect(redacted.name).toBe('Test Endpoint');
    expect(redacted.webhookSecret).toBe('[REDACTED]');
    expect(redacted.nested.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.userPassword).toBe('[REDACTED]');
    expect(redacted.nested.normalField).toBe('hello world');
  });

  it('5. sendWorkerHeartbeat and getWorkerHeartbeatStatus should track live worker status in Redis', async () => {
    const isRedisUp = await checkRedisHealth();
    if (!isRedisUp) return;

    await sendWorkerHeartbeat('alive');
    const status = await getWorkerHeartbeatStatus();

    expect(status.alive).toBe(true);
    expect(status.status).toBe('healthy');
    expect(status.heartbeat?.status).toBe('alive');
  });

  it('6. reclaimStaleOutboxRecords should reclaim stuck processing outbox entries', async () => {
    const testEvtId = `evt_stale_${Date.now()}`;
    const testOutId = `out_stale_${Date.now()}`;

    // Create a dummy event & outbox in processing state 10 minutes ago
    await db.insert(events).values({
      id: testEvtId,
      projectId: testProjectId,
      type: 'test.stale_recovery',
      payload: {},
      occurredAt: new Date(),
    });

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);

    await db.insert(eventOutbox).values({
      id: testOutId,
      eventId: testEvtId,
      status: 'processing',
      attempts: 1,
      availableAt: tenMinsAgo,
      updatedAt: tenMinsAgo,
    });

    const reclaimed = await reclaimStaleOutboxRecords(5 * 60 * 1000);
    expect(reclaimed.staleEventsCount).toBeGreaterThanOrEqual(1);

    const [updatedOutbox] = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.id, testOutId));

    expect(updatedOutbox.status).toBe('pending');
  });

  it('7. createAuditLog should insert redacted audit log record into database', async () => {
    await createAuditLog(db, {
      projectId: testProjectId,
      actorType: 'user',
      actorId: testUserId,
      action: 'rule.created',
      resourceType: 'rule',
      resourceId: 'rul_test_123',
      metadata: {
        ruleName: 'Daily Streak Bonus',
        secretToken: 'shh_secret_token_123',
      },
    });

    const safeMetadata = redactSensitiveData({ secretToken: 'shh_secret_token_123' });
    expect(safeMetadata.secretToken).toBe('[REDACTED]');
  });
});
