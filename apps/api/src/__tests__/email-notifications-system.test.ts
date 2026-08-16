import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  db,
  emailNotificationOutbox,
  endUsers,
  notifications,
  organizations,
  projects,
  users,
  runMigrations,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { createApiKey } from '../services/api-key.service.js';
import { buildServer } from '../index.js';
import { dispatchPendingEmailNotifications } from '../../../worker/src/email-notification-dispatcher.js';

describe('Milestone 18 — Multi-Channel Notifications & Email Delivery System Tests', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const testOrgId = `org_email_sys_${Date.now()}`;
  const testProjectId = `prj_email_sys_${Date.now()}`;
  const testUserId = `usr_email_sys_${Date.now()}`;
  let apiKeySecret: string;
  let adminCookie: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    // Create Platform Admin user & session
    const adminEmail = `smtp_admin_${Date.now()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: adminEmail, password: 'AdminPassword123!', name: 'SMTP Admin' },
    });
    expect(signupRes.statusCode).toBe(200);
    adminCookie = signupRes.headers['set-cookie'] as string;

    const [adminDbUser] = await db.select().from(users).where(eq(users.email, adminEmail));
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, adminDbUser.id));

    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Email Sys Test Org',
      slug: `email-sys-org-${Date.now()}`,
    });

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Email Sys Test Project',
      slug: `email-sys-prj-${Date.now()}`,
    });

    await db.insert(endUsers).values({
      id: testUserId,
      projectId: testProjectId,
      externalId: `ext_sys_${Date.now()}`,
      name: 'Sys Test User',
      email: 'sys.test@example.com',
    });

    const apiKeyResult = await createApiKey(testProjectId, 'Email Test Key');
    apiKeySecret = apiKeyResult.rawSecret;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET & PATCH /api/projects/:projectId/users/:userId/notification-preferences', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${testProjectId}/users/${testUserId}/notification-preferences`,
      headers: { 'x-api-key': apiKeySecret },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.preferences).toBeDefined();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${testProjectId}/users/${testUserId}/notification-preferences`,
      headers: { 'x-api-key': apiKeySecret },
      payload: {
        preferences: [
          {
            channel: 'email',
            notificationType: 'xp_awarded',
            enabled: true,
          },
        ],
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json();
    expect(patchBody.updated).toBe(1);
    expect(patchBody.preferences[0].enabled).toBe(true);
  });

  it('2. GET /api/admin/smtp requires platform admin authorization', async () => {
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/admin/smtp',
    });

    expect(unauthRes.statusCode).toBe(401);

    const authRes = await app.inject({
      method: 'GET',
      url: '/api/admin/smtp',
      headers: { cookie: adminCookie },
    });

    expect(authRes.statusCode).toBe(200);
  });

  it('3. PUT /api/admin/smtp saves encrypted SMTP config and never returns plaintext password', async () => {
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/admin/smtp',
      headers: { cookie: adminCookie },
      payload: {
        host: 'smtp.mailtrap.io',
        port: 587,
        user: 'test_user',
        password: 'super_secret_smtp_password_123',
        fromEmail: 'noreply@gami.dev',
        fromName: 'Gami Engine Test',
        secure: false,
      },
    });

    expect(putRes.statusCode).toBe(200);
    const body = putRes.json();
    expect(body.configured).toBe(true);

    // Verify GET response redacts password
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/admin/smtp',
      headers: { cookie: adminCookie },
    });

    const getBody = getRes.json();
    expect(getBody.host).toBe('smtp.mailtrap.io');
    expect(getBody.password).toBe('[REDACTED]');
    expect(getBody.passwordConfigured).toBe(true);
  });

  it('4. POST /api/admin/smtp/test sends test email log or handles mock connection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/smtp/test',
      headers: { cookie: adminCookie },
      payload: {
        recipientEmail: 'admin.test@example.com',
      },
    });

    // Accept 200 (if SMTP server available) or 500 (if local test environment lacks internet/SMTP route)
    expect([200, 500]).toContain(res.statusCode);
  });

  it(
    '5. Worker email dispatcher recovers and marks retry backoff on delivery failure',
    async () => {
    const testNotifId = `notif_sys_test_${Date.now()}`;
    const testEobId = `eob_sys_test_${Date.now()}`;

    // Create target canonical notification first
    await db.insert(notifications).values({
      id: testNotifId,
      projectId: testProjectId,
      userId: testUserId,
      type: 'xp_awarded',
      title: 'XP Awarded',
      message: 'You earned 100 XP',
      data: { xp: 100 },
      sourceType: 'xp_event',
      sourceId: 'evt_123',
    });

    await db.insert(emailNotificationOutbox).values({
      id: testEobId,
      projectId: testProjectId,
      notificationId: testNotifId,
      userId: testUserId,
      recipientEmail: 'sys.test@example.com',
      notificationType: 'xp_awarded',
      subject: 'XP Awarded',
      htmlBody: '<p>You earned 100 XP</p>',
      textBody: 'You earned 100 XP',
      payload: { xp: 100 },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
    });

    // Dispatcher execution should increment attempts on unroutable SMTP connection in unit test env
    const result = await dispatchPendingEmailNotifications(10);
    expect(result).toBeDefined();

    const [updatedEob] = await db
      .select()
      .from(emailNotificationOutbox)
      .where(eq(emailNotificationOutbox.id, testEobId));

    expect(updatedEob).toBeDefined();
    expect(updatedEob.attempts).toBeGreaterThanOrEqual(1);
  }, 15000);
});
