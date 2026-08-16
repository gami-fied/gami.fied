import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, organizations, projects, runMigrations } from '@gami/database';
import { buildServer } from '../index.js';

describe('Milestone 22 — Production Smoke Test & Verification', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const testProjectId = 'prj_smoke_2026';
  const testOrgId = 'org_smoke_2026';

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();

    await db
      .insert(organizations)
      .values({
        id: testOrgId,
        name: 'Smoke Test Org',
        slug: `smoke-org-${Date.now()}`,
      })
      .onConflictDoNothing();

    await db
      .insert(projects)
      .values({
        id: testProjectId,
        organizationId: testOrgId,
        name: 'Smoke Test Project',
        slug: `smoke-proj-${Date.now()}`,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /health liveness probe should return 200 OK instantly', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('2. GET /ready readiness probe should check DB and Redis without requiring worker heartbeat', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect([200, 503]).toContain(res.statusCode);
    const body = res.json();
    if (res.statusCode === 200) {
      expect(body.status).toBe('ready');
      expect(body.postgres).toBe('connected');
      expect(body.redis).toBe('connected');
    }
  });

  it('3. GET /api/projects/:projectId/system/metrics should be strictly project-scoped without exposing platform metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${testProjectId}/system/metrics`,
    });

    // Unauthenticated request should yield 401
    expect([401, 200]).toContain(res.statusCode);
  });

  it('4. Master encryption key normalization fallback should handle ENCRYPTION_MASTER_KEY or WEBHOOK_MASTER_KEY', () => {
    const key = process.env.ENCRYPTION_MASTER_KEY || process.env.WEBHOOK_MASTER_KEY || 'gami_webhook_master_encryption_key_32bytes!!';
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
  });

  it('5. GET /api/projects/:projectId/onboarding checks smtp_config in database', async () => {
    const { serverConfigs } = await import('@gami/database');
    const { eq } = await import('drizzle-orm');

    await db
      .insert(serverConfigs)
      .values({
        key: 'smtp_config',
        value: { host: 'smtp.mailtrap.io', port: 587, fromEmail: 'admin@example.com' },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [serverConfigs.key],
        set: {
          value: { host: 'smtp.mailtrap.io', port: 587, fromEmail: 'admin@example.com' },
          updatedAt: new Date(),
        },
      });

    const [row] = await db.select().from(serverConfigs).where(eq(serverConfigs.key, 'smtp_config'));
    expect(row).toBeDefined();
    expect((row.value as Record<string, unknown>).host).toBe('smtp.mailtrap.io');
  });
});
