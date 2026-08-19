import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import { db, organizations, projects, users, member, apiKeys, events, platformBackups, session as sessionTable, Rule } from '@gami/database';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { validateProductionConfig } from '@gami/config';

describe('Milestone 26 — Release Readiness & Security Audit Test Suite', () => {
  let app: FastifyInstance;
  let adminUserId: string;
  let adminCookie: string;
  let userAId: string;
  let userACookie: string;
  let userBId: string;
  let userBCookie: string;

  let orgAId: string;
  let orgBId: string;

  let projAId: string;
  let projBId: string;

  let rawApiKeyA: string;
  let rawApiKeyB: string;
  let revokedApiKeyA: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Create Platform Admin User & Session via Better-Auth signup
    const adminEmail = `admin_${randomUUID()}@example.com`;
    const adminSignupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: adminEmail, password: 'AdminPassword123!', name: 'Platform Admin' },
    });
    expect(adminSignupRes.statusCode).toBe(200);
    adminCookie = adminSignupRes.headers['set-cookie'] as string;

    const [adminUserRecord] = await db.select().from(users).where(eq(users.email, adminEmail));
    adminUserId = adminUserRecord.id;
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, adminUserId));

    // 2. Create User A & User B
    const userAEmail = `usera_${randomUUID()}@example.com`;
    const userASignupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: userAEmail, password: 'UserAPassword123!', name: 'User A' },
    });
    expect(userASignupRes.statusCode).toBe(200);
    userACookie = userASignupRes.headers['set-cookie'] as string;
    const [userARecord] = await db.select().from(users).where(eq(users.email, userAEmail));
    userAId = userARecord.id;

    const userBEmail = `userb_${randomUUID()}@example.com`;
    const userBSignupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: userBEmail, password: 'UserBPassword123!', name: 'User B' },
    });
    expect(userBSignupRes.statusCode).toBe(200);
    userBCookie = userBSignupRes.headers['set-cookie'] as string;
    const [userBRecord] = await db.select().from(users).where(eq(users.email, userBEmail));
    userBId = userBRecord.id;

    // 3. Create Org A & Org B
    orgAId = `org_a_${randomUUID().substring(0, 8)}`;
    await db.insert(organizations).values({
      id: orgAId,
      name: 'Organization A',
      slug: `org-a-${randomUUID().substring(0, 6)}`,
      status: 'active',
    });
    await db.insert(member).values({
      id: `mem_a_${randomUUID().substring(0, 8)}`,
      organizationId: orgAId,
      userId: userAId,
      role: 'owner',
    });

    orgBId = `org_b_${randomUUID().substring(0, 8)}`;
    await db.insert(organizations).values({
      id: orgBId,
      name: 'Organization B',
      slug: `org-b-${randomUUID().substring(0, 6)}`,
      status: 'active',
    });
    await db.insert(member).values({
      id: `mem_b_${randomUUID().substring(0, 8)}`,
      organizationId: orgBId,
      userId: userBId,
      role: 'owner',
    });

    // 4. Create Project A & Project B
    projAId = `prj_a_${randomUUID().substring(0, 8)}`;
    await db.insert(projects).values({
      id: projAId,
      organizationId: orgAId,
      name: 'Project A',
      slug: `proj-a-${randomUUID().substring(0, 6)}`,
    });

    projBId = `prj_b_${randomUUID().substring(0, 8)}`;
    await db.insert(projects).values({
      id: projBId,
      organizationId: orgBId,
      name: 'Project B',
      slug: `proj-b-${randomUUID().substring(0, 6)}`,
    });

    // 5. Create API Keys
    const { createApiKey } = await import('../services/api-key.service.js');
    const keyAObj = await createApiKey(projAId, 'Key A', ['*']);
    rawApiKeyA = keyAObj.rawSecret;

    const keyBObj = await createApiKey(projBId, 'Key B', ['*']);
    rawApiKeyB = keyBObj.rawSecret;

    const revokedKeyObj = await createApiKey(projAId, 'Revoked Key A', ['*']);
    revokedApiKeyA = revokedKeyObj.rawSecret;
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.keyPrefix, revokedKeyObj.keyPrefix));
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Platform Admin authorization: Platform Admin endpoints accept Platform Admin and reject API keys & regular users', async () => {
    // Platform Admin -> 200
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: adminCookie },
    });
    expect(adminRes.statusCode).toBe(200);

    // Regular User A -> 403
    const userRes = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: userACookie },
    });
    expect(userRes.statusCode).toBe(403);

    // API Key -> 403
    const apiKeyRes = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { 'x-api-key': rawApiKeyA },
    });
    expect(apiKeyRes.statusCode).toBe(403);
  });

  it('2. Organization authorization: Enforces Organization membership and role boundaries', async () => {
    // Owner User A accesses Org A members -> 200
    const resA = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgAId}/members`,
      headers: { cookie: userACookie },
    });
    expect(resA.statusCode).toBe(200);

    // Non-member User B attempts Org A members -> 403
    const resB = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgAId}/members`,
      headers: { cookie: userBCookie },
    });
    expect(resB.statusCode).toBe(403);
  });

  it('3. Project authorization & Cross-Tenant IDOR: Prevents accessing another tenant\'s project resources', async () => {
    // User A attempts to list rules in Project B (Org B) -> 404 (IDOR defense)
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projBId}/rules`,
      headers: { cookie: userACookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('4. API Key scope enforcement & Revocation: Rejects revoked API keys', async () => {
    // Valid API Key A -> 200/201 on event ingestion
    const validRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': rawApiKeyA },
      payload: { event: 'user.signup', user_id: 'usr_rel_1' },
    });
    expect(validRes.statusCode).toBe(202);

    // Revoked API Key -> 401
    const revokedRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': revokedApiKeyA },
      payload: { event: 'user.signup', user_id: 'usr_rel_2' },
    });
    expect(revokedRes.statusCode).toBe(401);
  });

  it('5. Suspended organization access: Rejects event ingestion for suspended organization', async () => {
    const suspendedOrgId = `org_susp_${randomUUID().substring(0, 8)}`;
    await db.insert(organizations).values({
      id: suspendedOrgId,
      name: 'Suspended Org',
      slug: `susp-org-${randomUUID().substring(0, 6)}`,
      status: 'suspended',
    });

    const suspendedProjId = `prj_susp_${randomUUID().substring(0, 8)}`;
    await db.insert(projects).values({
      id: suspendedProjId,
      organizationId: suspendedOrgId,
      name: 'Suspended Project',
      slug: `susp-proj-${randomUUID().substring(0, 6)}`,
    });

    const { createApiKey } = await import('../services/api-key.service.js');
    const suspKeyObj = await createApiKey(suspendedProjId, 'Suspended Key');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': suspKeyObj.rawSecret },
      payload: { event: 'test.event', user_id: 'usr_susp_1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('suspended');
  });

  it('6. Request ID propagation: X-Request-Id is generated and returned in headers', async () => {
    const customReqId = `req_${randomUUID()}`;
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': customReqId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe(customReqId);
  });

  it('7. Standardized nested errors: Returns error object with code, message, and requestId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/non_existent_project_id_123/rules',
      headers: { cookie: userACookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBeDefined();
    expect(body.error.requestId).toBeDefined();
  });

  it('8. Organization Logical Export Tenant Isolation & Secret Redaction Guarantee', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${orgAId}/export`,
      headers: { cookie: userACookie },
    });

    expect(res.statusCode).toBe(200);
    const exportPackage = res.json();
    expect(exportPackage.format).toBe('gami-organization-export');
    expect(exportPackage.version).toBe(1);
    expect(exportPackage.manifest.organizationId).toBe(orgAId);

    // Verify secret fields (passwords, tokens, API key secrets) are redacted
    const rawExportStr = JSON.stringify(exportPackage);
    expect(rawExportStr).not.toContain('passwordHash');
    expect(rawExportStr).not.toContain(rawApiKeyA);
  });

  it('9. Platform Backup Authorization: Rejects non-admin users and API keys', async () => {
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      headers: { cookie: userACookie },
    });
    expect(userRes.statusCode).toBe(403);

    const apiKeyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      headers: { 'x-api-key': rawApiKeyA },
    });
    expect(apiKeyRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      headers: { cookie: adminCookie },
      payload: { backupType: 'manual', encrypt: true },
    });
    expect(adminRes.statusCode).toBe(201);
  });

  it('10. Production Configuration Validation: Rejects default secrets when NODE_ENV=production', () => {
    const oldEnv = process.env.NODE_ENV;
    const oldSecret = process.env.BETTER_AUTH_SECRET;
    const oldDb = process.env.DATABASE_URL;
    const oldRedis = process.env.REDIS_URL;
    const oldKey = process.env.ENCRYPTION_MASTER_KEY;

    try {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://prod_user:secure_prod_pass@127.0.0.1:5432/gami';
      process.env.REDIS_URL = 'redis://127.0.0.1:6379';
      process.env.ENCRYPTION_MASTER_KEY = '01234567890123456789012345678901';
      process.env.BETTER_AUTH_SECRET = 'super-secret-auth-key-123456789';
      expect(() => validateProductionConfig()).toThrow('Insecure default BETTER_AUTH_SECRET detected');
    } finally {
      process.env.NODE_ENV = oldEnv;
      process.env.BETTER_AUTH_SECRET = oldSecret;
      process.env.DATABASE_URL = oldDb;
      process.env.REDIS_URL = oldRedis;
      process.env.ENCRYPTION_MASTER_KEY = oldKey;
    }
  });
});
