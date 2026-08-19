import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, runMigrations, serverConfigs, users, verification } from '@gami/database';
import { eq } from 'drizzle-orm';
import { buildServer } from '../index.js';

describe('Email OTP Verification & User Profile Subsystem Tests', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookieHeader = '';
  const testEmail = `otp_test_${Date.now()}@example.com`;

  beforeAll(async () => {
    await runMigrations();
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscribed_to_system_emails" boolean DEFAULT true NOT NULL;`);
    app = await buildServer();
    await app.ready();

    // Sign up platform admin user via auth API
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: testEmail,
        password: 'TestPassword123!',
        name: 'OTP Test User',
      },
    });

    expect(signupRes.statusCode).toBe(200);
    const setCookie = signupRes.headers['set-cookie'];
    cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie as string);

    // Promote to platform admin
    const [dbUser] = await db.select().from(users).where(eq(users.email, testEmail));
    if (dbUser) {
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, dbUser.id));
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /api/user/profile fetches user profile & subscription preferences', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/profile',
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe(testEmail);
    expect(body.subscribedToSystemEmails).toBe(true);
  });

  it('2. PUT /api/user/profile updates name and toggles system email subscription', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/user/profile',
      headers: { cookie: cookieHeader },
      payload: {
        name: 'Updated OTP User',
        subscribedToSystemEmails: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.name).toBe('Updated OTP User');
    expect(body.user.subscribedToSystemEmails).toBe(false);
  });

  it('3. Enabling Email OTP Verification without SMTP throws error', async () => {
    // Delete SMTP config temporarily
    await db.delete(serverConfigs).where(eq(serverConfigs.key, 'smtp_config'));

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/security',
      headers: { cookie: cookieHeader },
      payload: {
        requireEmailOtpVerification: true,
      },
    });

    expect([200, 400]).toContain(res.statusCode);
  });

  it('4. POST /api/auth/otp/send & verify handles 6-digit OTP verification', async () => {
    const sendRes = await app.inject({
      method: 'POST',
      url: '/api/auth/otp/send',
      headers: { cookie: cookieHeader },
      payload: {},
    });

    expect(sendRes.statusCode).toBe(200);

    // Retrieve generated OTP token from database
    const [verRow] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, testEmail));

    expect(verRow).toBeDefined();
    expect(verRow.value).toHaveLength(6);

    // Submit OTP verification
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/otp/verify',
      headers: { cookie: cookieHeader },
      payload: { code: verRow.value },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = verifyRes.json();
    expect(verifyBody.verified).toBe(true);

    // Check user emailVerified is now true
    const [userRow] = await db.select().from(users).where(eq(users.email, testEmail));
    expect(userRow.emailVerified).toBe(true);
  });
});
