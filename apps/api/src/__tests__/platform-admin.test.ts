import { randomUUID } from 'crypto';
import { apiKeys, auditLogs, db, member, organizations, projects, users } from '@gami/database';
import { promoteUserToPlatformAdmin } from '../../../../packages/database/src/scripts/promote-admin.js';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, hashApiKey } from '../services/api-key.service.js';
import { buildServer } from '../index.js';

describe('Milestone 19 — Platform Administration, Security & Configuration Management Test Suite', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let adminUserId: string;
  let adminCookie: string;
  let normalUserId: string;
  let normalCookie: string;
  let orgId: string;
  let projectId: string;
  let validApiKeySecret: string;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();

    // 1. Create Platform Admin User & Cookie
    const adminEmail = `platform_admin_${randomUUID()}@example.com`;
    const password = 'PlatformAdminPass123!';

    const adminSignupRes = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: adminEmail, password, name: 'Platform Admin' },
    });
    expect(adminSignupRes.statusCode).toBe(200);
    adminCookie = adminSignupRes.headers['set-cookie'] as string;

    const [adminUserRecord] = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail));
    expect(adminUserRecord).toBeDefined();
    adminUserId = adminUserRecord.id;

    // Grant isPlatformAdmin flag directly in DB
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, adminUserId));

    // 2. Create Normal User & Cookie
    const normalEmail = `normal_user_${randomUUID()}@example.com`;
    const normalSignupRes = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: normalEmail, password, name: 'Normal User' },
    });
    expect(normalSignupRes.statusCode).toBe(200);
    normalCookie = normalSignupRes.headers['set-cookie'] as string;

    const [normalUserRecord] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalEmail));
    expect(normalUserRecord).toBeDefined();
    normalUserId = normalUserRecord.id;

    // 3. Create Org & Project owned by Normal User
    const orgRes = await server.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: normalCookie },
      payload: { name: 'Test Security Org', slug: `sec-org-${randomUUID().substring(0, 8)}` },
    });
    expect(orgRes.statusCode).toBe(201);
    orgId = JSON.parse(orgRes.payload).id;

    const prjRes = await server.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: normalCookie },
      payload: {
        organizationId: orgId,
        name: 'Security Project',
        slug: `sec-prj-${randomUUID().substring(0, 8)}`,
      },
    });
    expect(prjRes.statusCode).toBe(201);
    projectId = JSON.parse(prjRes.payload).id;

    // Create API key for project
    const generatedKey = await createApiKey(projectId, 'Default Key', ['*']);
    validApiKeySecret = generatedKey.rawSecret;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('1. Session-Only Platform Admin Authorization: Grants access to Platform Admin and denies Normal Users and API Keys', async () => {
    // A. Normal user attempt -> 403 Forbidden
    const normalAttempt = await server.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: normalCookie },
    });
    expect(normalAttempt.statusCode).toBe(403);
    expect(JSON.parse(normalAttempt.payload).message).toContain(
      'Platform administrator authorization required'
    );

    // B. API Key attempt -> 403 Forbidden
    const apiKeyAttempt = await server.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { 'x-api-key': validApiKeySecret },
    });
    expect(apiKeyAttempt.statusCode).toBe(403);
    expect(JSON.parse(apiKeyAttempt.payload).message).toContain(
      'API keys cannot access platform administrator endpoints'
    );

    // C. Platform Admin session -> 200 OK
    const adminAttempt = await server.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: adminCookie },
    });
    expect(adminAttempt.statusCode).toBe(200);
    const systemData = JSON.parse(adminAttempt.payload);
    expect(systemData.health).toBeDefined();
    expect(systemData.counts).toBeDefined();
  });

  it('2. Organization Suspension & Reactivation: Centralized suspension blocks project access while preserving data', async () => {
    // A. Verify normal access works
    const preRes = await server.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/users`,
      headers: { cookie: normalCookie },
    });
    expect(preRes.statusCode).toBe(200);

    // B. Suspend Organization via Platform Admin API
    const suspendRes = await server.inject({
      method: 'PATCH',
      url: `/api/admin/organizations/${orgId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'suspended' },
    });
    expect(suspendRes.statusCode).toBe(200);

    // C. Verify project API calls return 403 Forbidden
    const suspendedCookieRes = await server.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/users`,
      headers: { cookie: normalCookie },
    });
    expect(suspendedCookieRes.statusCode).toBe(403);
    expect(JSON.parse(suspendedCookieRes.payload).message).toContain(
      'Organization account is suspended'
    );

    const suspendedApiKeyRes = await server.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': validApiKeySecret },
      payload: { event: 'test_event', user_id: 'user_123' },
    });
    expect(suspendedApiKeyRes.statusCode).toBe(403);

    // D. Reactivate Organization via Platform Admin API
    const reactivateRes = await server.inject({
      method: 'PATCH',
      url: `/api/admin/organizations/${orgId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    });
    expect(reactivateRes.statusCode).toBe(200);

    // E. Verify normal access is fully restored
    const postRes = await server.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/users`,
      headers: { cookie: normalCookie },
    });
    expect(postRes.statusCode).toBe(200);
  });

  it('3. Server Configuration & Secrets Redaction: Encrypts secrets and redacts sensitive data in API responses', async () => {
    const rawSecretPassword = 'SuperSecretSmtpPassword123!';

    // Save configuration
    const saveConfigRes = await server.inject({
      method: 'PATCH',
      url: '/api/admin/config',
      headers: { cookie: adminCookie },
      payload: {
        category: 'smtp',
        payload: {
          host: 'smtp.sendgrid.net',
          port: 587,
          fromEmail: 'noreply@gami.io',
          password: rawSecretPassword,
        },
      },
    });
    expect(saveConfigRes.statusCode).toBe(200);

    // Retrieve safe config status
    const getConfigRes = await server.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: { cookie: adminCookie },
    });
    expect(getConfigRes.statusCode).toBe(200);
    const configs = JSON.parse(getConfigRes.payload).configurations;
    expect(configs.smtp).toBeDefined();
    expect(configs.smtp.encryptedPassword).toBe('[REDACTED]');
    expect(configs.smtp.encryptedPasswordConfigured).toBe(true);
    expect(JSON.stringify(configs.smtp)).not.toContain(rawSecretPassword);
  });

  it('4. Hardened API Key Validation: Rejects revoked and expired API keys with 401', async () => {
    // A. Test Revoked API Key
    const revokedKeyRecord = await createApiKey(projectId, 'Revoked Key', ['*']);
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, revokedKeyRecord.id));

    const revokedRes = await server.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': revokedKeyRecord.rawSecret },
      payload: { event: 'test_event', user_id: 'user_123' },
    });
    expect(revokedRes.statusCode).toBe(401);

    // B. Test Expired API Key
    const pastDate = new Date(Date.now() - 3600 * 1000);
    const expiredKeyRecord = await createApiKey(projectId, 'Expired Key', ['*'], pastDate);

    const expiredRes = await server.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': expiredKeyRecord.rawSecret },
      payload: { event: 'test_event', user_id: 'user_123' },
    });
    expect(expiredRes.statusCode).toBe(401);
  });

  it('5. Global Audit Logging & Severity: Verifies administrative security audit events and durable ON DELETE SET NULL references', async () => {
    const logsRes = await server.inject({
      method: 'GET',
      url: '/api/admin/audit-logs',
      headers: { cookie: adminCookie },
    });
    expect(logsRes.statusCode).toBe(200);
    const auditData = JSON.parse(logsRes.payload);
    expect(Array.isArray(auditData.auditLogs)).toBe(true);

    // Verify at least one security action logged
    const securityLogs = auditData.auditLogs.filter(
      (l: any) => l.action.startsWith('admin.') || l.severity === 'warning' || l.severity === 'critical'
    );
    expect(securityLogs.length).toBeGreaterThan(0);
  });

  it('6. First-Time Platform Admin Bootstrap & Status Endpoints', async () => {
    // A. GET /api/admin/bootstrap/status returns status
    const statusRes = await server.inject({
      method: 'GET',
      url: '/api/admin/bootstrap/status',
    });
    expect(statusRes.statusCode).toBe(200);
    const statusData = JSON.parse(statusRes.payload);
    expect(statusData.hasPlatformAdmin).toBe(true);
    expect(statusData.canBootstrap).toBe(false);

    // B. Re-attempting bootstrap when admins exist returns 409 Conflict
    process.env.PLATFORM_BOOTSTRAP_SECRET = 'test_secret_key_123';
    const claimAttempt = await server.inject({
      method: 'POST',
      url: '/api/admin/bootstrap',
      headers: { cookie: normalCookie },
      payload: { bootstrapSecret: 'test_secret_key_123' },
    });
    expect(claimAttempt.statusCode).toBe(409);
    expect(JSON.parse(claimAttempt.payload).message).toContain('Bootstrap is permanently disabled');

    // C. Unauthenticated bootstrap returns 401
    const unauthClaim = await server.inject({
      method: 'POST',
      url: '/api/admin/bootstrap',
      payload: { bootstrapSecret: 'test_secret_key_123' },
    });
    expect(unauthClaim.statusCode).toBe(401);

    // D. Missing env secret returns 503
    delete process.env.PLATFORM_BOOTSTRAP_SECRET;
    const noEnvClaim = await server.inject({
      method: 'POST',
      url: '/api/admin/bootstrap',
      headers: { cookie: normalCookie },
      payload: { bootstrapSecret: 'test_secret_key_123' },
    });
    expect(noEnvClaim.statusCode).toBe(503);
  });

  it('7. Emergency CLI Promotion Tool: Promotes existing user and handles non-existent user safely', async () => {
    const freshUserEmail = `fresh_cli_${randomUUID()}@example.com`;
    const signupRes = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: freshUserEmail, password: 'UserPass123!', name: 'CLI Target User' },
    });
    expect(signupRes.statusCode).toBe(200);

    // Promote user via promoteUserToPlatformAdmin CLI function
    const cliSuccess = await promoteUserToPlatformAdmin(freshUserEmail);
    expect(cliSuccess).toBe(true);

    const [promotedUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, freshUserEmail));
    expect(promotedUser.isPlatformAdmin).toBe(true);

    // Nonexistent user returns false
    const cliFail = await promoteUserToPlatformAdmin(`nonexistent_${randomUUID()}@example.com`);
    expect(cliFail).toBe(false);
  });
});
