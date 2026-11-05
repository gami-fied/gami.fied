import { randomUUID } from 'crypto';
import {
  apiKeys,
  db,
  endUsers,
  member,
  organizations,
  projects,
  runMigrations,
  serverConfigs,
  users,
  verification,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OTP_MAX_ATTEMPTS, sendOtpEmailToUser } from '../auth/otp.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Security regressions', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_sec_${suffix}`;
  const otherOrgId = `org_sec_other_${suffix}`;
  const projectId = `prj_sec_${suffix}`;
  const otherProjectId = `prj_sec_other_${suffix}`;
  const endUserId = `usr_sec_${suffix}`;
  const otherEndUserId = `usr_sec_other_${suffix}`;
  let ownerCookie: string;
  let memberCookie: string;
  let ownerEmail: string;

  const signUp = async (label: string) => {
    const email = `${label}_${randomUUID()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email, password: 'Password123!', name: label },
    });
    expect(res.statusCode).toBe(200);
    return {
      email,
      id: JSON.parse(res.payload).user.id as string,
      cookie: res.headers['set-cookie'] as string,
    };
  };

  const setOtpPolicy = async (required: boolean) => {
    const value = { requireEmailOtpVerification: required };
    await db
      .insert(serverConfigs)
      .values({ key: 'security_config', value })
      .onConflictDoUpdate({ target: serverConfigs.key, set: { value } });
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values([
      { id: orgId, name: 'Security Org', slug: `sec-${suffix}` },
      { id: otherOrgId, name: 'Other Org', slug: `sec-other-${suffix}` },
    ]);
    await db.insert(projects).values([
      { id: projectId, organizationId: orgId, name: 'Security', slug: 'security' },
      { id: otherProjectId, organizationId: otherOrgId, name: 'Other', slug: 'other' },
    ]);
    await db.insert(endUsers).values([
      { id: endUserId, projectId, externalId: 'sec_user' },
      { id: otherEndUserId, projectId: otherProjectId, externalId: 'other_user' },
    ]);

    const owner = await signUp('sec_owner');
    const plainMember = await signUp('sec_member');
    ownerCookie = owner.cookie;
    ownerEmail = owner.email;
    memberCookie = plainMember.cookie;
    await db.insert(member).values([
      { id: `mem_o_${suffix}`, organizationId: orgId, userId: owner.id, role: 'owner', createdAt: new Date() },
      { id: `mem_m_${suffix}`, organizationId: orgId, userId: plainMember.id, role: 'member', createdAt: new Date() },
    ]);
  });

  afterAll(async () => {
    await db.delete(serverConfigs).where(eq(serverConfigs.key, 'security_config'));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, otherOrgId));
    await app.close();
  });

  describe('API keys', () => {
    it('cannot delete or export the organization, even with full access', async () => {
      const { rawSecret } = await createApiKey(projectId, 'Full', ['*']);
      const headers = { 'x-api-key': rawSecret };

      const del = await app.inject({ method: 'DELETE', url: `/api/organizations/${orgId}`, headers });
      expect(del.statusCode).toBe(403);

      const exported = await app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/export`,
        headers,
      });
      expect(exported.statusCode).toBe(403);

      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
      expect(org).toBeDefined();
    });

    it('cannot manage keys, members or the project', async () => {
      const { rawSecret } = await createApiKey(projectId, 'Full', ['*']);
      const headers = { 'x-api-key': rawSecret };

      for (const [method, url] of [
        ['POST', `/api/projects/${projectId}/api-keys`],
        ['GET', `/api/projects/${projectId}/api-keys`],
        ['GET', `/api/projects/${projectId}/members`],
        ['DELETE', `/api/projects/${projectId}`],
        ['PATCH', `/api/projects/${projectId}`],
      ] as const) {
        const res = await app.inject({ method, url, headers, payload: method === 'GET' ? undefined : {} });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
      }
    });

    it('defaults to send-only, so a new key cannot read or change anything else', async () => {
      const created = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/api-keys`,
        headers: { cookie: ownerCookie },
        payload: { name: 'Ingest' },
      });
      expect(created.statusCode).toBe(201);
      const { rawSecret, scopes } = JSON.parse(created.payload);
      expect(scopes).toEqual(['events:write']);
      const headers = { 'x-api-key': rawSecret };

      const ingest = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers,
        payload: { event: 'sec.test', user_id: 'sec_user' },
      });
      expect(ingest.statusCode).toBe(202);

      const read = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/users`, headers });
      expect(read.statusCode).toBe(403);

      const write = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/rules`,
        headers,
        payload: { name: 'x', trigger: 'y', actions: [{ type: 'log' }] },
      });
      expect(write.statusCode).toBe(403);
    });

    it('blocks event ingestion for a key without events:write', async () => {
      const { rawSecret } = await createApiKey(projectId, 'Reader', ['users:read']);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': rawSecret },
        payload: { event: 'sec.test' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('honours specific scopes, and write implies read', async () => {
      const { rawSecret } = await createApiKey(projectId, 'Rules', ['rules:write']);
      const headers = { 'x-api-key': rawSecret };

      const list = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/rules`, headers });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/rules`,
        headers,
        payload: { name: 'Scoped', trigger: 'sec.test', actions: [{ type: 'log' }] },
      });
      expect(create.statusCode).toBe(201);
    });

    it('rejects unknown scopes and past expiry dates', async () => {
      const url = `/api/projects/${projectId}/api-keys`;
      const headers = { cookie: ownerCookie };

      const scope = await app.inject({ method: 'POST', url, headers, payload: { name: 'x', scopes: ['api-keys:write'] } });
      expect(scope.statusCode).toBe(400);

      const expiry = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: { name: 'x', expiresAt: new Date(Date.now() - 1000).toISOString() },
      });
      expect(expiry.statusCode).toBe(400);
    });

    it('rotation keeps the old key working during the overlap, then it expires', async () => {
      const old = await createApiKey(projectId, 'Rotating', ['events:write']);
      const rotate = (overlapHours: number) =>
        app.inject({
          method: 'POST',
          url: `/api/projects/${projectId}/api-keys/${old.id}/rotate`,
          headers: { cookie: ownerCookie },
          payload: { overlapHours },
        });

      const res = await rotate(1);
      expect(res.statusCode).toBe(201);
      const replacement = JSON.parse(res.payload);
      expect(replacement.rawSecret).not.toBe(old.rawSecret);
      expect(replacement.scopes).toEqual(['events:write']);

      const send = (key: string) =>
        app.inject({ method: 'POST', url: '/v1/events', headers: { 'x-api-key': key }, payload: { event: 'sec.rotate' } });
      expect((await send(old.rawSecret)).statusCode).toBe(202);
      expect((await send(replacement.rawSecret)).statusCode).toBe(202);

      await db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiKeys.id, old.id));
      expect((await send(old.rawSecret)).statusCode).toBe(401);
    });
  });

  describe('Roles and tenant boundaries', () => {
    it('stops plain members from creating, changing or deleting rules', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/rules`,
        headers: { cookie: ownerCookie },
        payload: { name: 'Owned', trigger: 'sec.role', actions: [{ type: 'log' }] },
      });
      expect(res.statusCode).toBe(201);
      const rule = JSON.parse(res.payload);

      await db.insert(projects).values({ id: `prj_m_${suffix}`, organizationId: orgId, name: 'M', slug: 'm' }).onConflictDoNothing();

      for (const [method, url] of [
        ['POST', `/api/projects/${projectId}/rules`],
        ['PATCH', `/api/projects/${projectId}/rules/${rule.id}`],
        ['DELETE', `/api/projects/${projectId}/rules/${rule.id}`],
      ] as const) {
        const denied = await app.inject({ method, url, headers: { cookie: memberCookie }, payload: {} });
        expect([403, 404], `${method} ${url}`).toContain(denied.statusCode);
      }
    });

    it('refuses an XP adjustment for a user in another project', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/users/${otherEndUserId}/xp/adjust`,
        headers: { cookie: ownerCookie },
        payload: { amount: 10, reason: 'cross tenant' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Email verification', () => {
    it('never verifies through a code sent to a different address', async () => {
      const victim = await signUp('otp_victim');
      const attackerEmail = `attacker_${randomUUID()}@example.com`;

      const { otpCode } = await sendOtpEmailToUser(attackerEmail);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/otp/verify',
        headers: { cookie: victim.cookie },
        payload: { email: attackerEmail, code: otpCode },
      });
      expect(res.statusCode).toBe(400);

      const [row] = await db.select().from(users).where(eq(users.id, victim.id));
      expect(row?.emailVerified).toBe(false);
    });

    it('stores only a hash of the code', async () => {
      const user = await signUp('otp_hash');
      const { otpCode } = await sendOtpEmailToUser(user.email);

      const rows = await db.select().from(verification).where(eq(verification.identifier, `otp:${user.email}`));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.value).not.toContain(otpCode);
    });

    it('burns the code after too many wrong guesses', async () => {
      const user = await signUp('otp_burn');
      const { otpCode } = await sendOtpEmailToUser(user.email);
      const wrong = otpCode === '111111' ? '222222' : '111111';
      const verify = (code: string) =>
        app.inject({ method: 'POST', url: '/api/auth/otp/verify', headers: { cookie: user.cookie }, payload: { code } });

      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        expect((await verify(wrong)).statusCode).toBe(400);
      }
      expect((await verify(otpCode)).statusCode).toBe(429);
      expect((await verify(otpCode)).statusCode).toBe(400);
    });

    it('enforces the verification policy on the API, not just in the dashboard', async () => {
      const user = await signUp('otp_gate');
      await setOtpPolicy(true);

      const blocked = await app.inject({ method: 'GET', url: '/api/organizations', headers: { cookie: user.cookie } });
      expect(blocked.statusCode).toBe(403);
      expect(JSON.parse(blocked.payload).code).toBe('EMAIL_NOT_VERIFIED');

      const status = await app.inject({ method: 'GET', url: '/api/auth/otp/status', headers: { cookie: user.cookie } });
      expect(status.statusCode).toBe(200);

      await setOtpPolicy(false);
      const allowed = await app.inject({ method: 'GET', url: '/api/organizations', headers: { cookie: user.cookie } });
      expect(allowed.statusCode).toBe(200);
    });

    it('reports honestly when no email could be sent', async () => {
      const user = await signUp('otp_nosmtp');
      const res = await app.inject({ method: 'POST', url: '/api/auth/otp/send', headers: { cookie: user.cookie }, payload: {} });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('Password reset', () => {
    it('resets the password with an emailed link and ends existing sessions', async () => {
      const { setPasswordResetSender } = await import('@gami/database');
      let resetUrl = '';
      setPasswordResetSender(async ({ url }) => {
        resetUrl = url;
      });

      const request = await app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { origin: 'http://localhost:3000' },
        payload: { email: ownerEmail, redirectTo: 'http://localhost:3000/reset-password' },
      });
      expect(request.statusCode).toBe(200);
      expect(resetUrl).toContain('/reset-password/');

      const token = new URL(resetUrl).pathname.split('/').pop();
      const reset = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        headers: { origin: 'http://localhost:3000' },
        payload: { newPassword: 'NewPassword456!', token },
      });
      expect(reset.statusCode).toBe(200);

      const oldSession = await app.inject({ method: 'GET', url: '/api/organizations', headers: { cookie: ownerCookie } });
      expect(oldSession.statusCode).toBe(401);

      const signIn = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: 'http://localhost:3000' },
        payload: { email: ownerEmail, password: 'NewPassword456!' },
      });
      expect(signIn.statusCode).toBe(200);
      ownerCookie = signIn.headers['set-cookie'] as string;
    });
  });

  describe('HTTP hardening', () => {
    it('sets security headers', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('ignores a forged X-Forwarded-Host when building auth links', async () => {
      const { setPasswordResetSender } = await import('@gami/database');
      let resetUrl = '';
      setPasswordResetSender(async ({ url }) => {
        resetUrl = url;
      });

      await app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: {
          origin: 'http://localhost:3000',
          'x-forwarded-host': 'evil.example.com',
          'x-forwarded-proto': 'https',
        },
        payload: { email: ownerEmail, redirectTo: 'http://localhost:3000/reset-password' },
      });

      expect(resetUrl).not.toBe('');
      expect(resetUrl).not.toContain('evil.example.com');
    });

    it('limits requests per IP address when configured', async () => {
      process.env.RATE_LIMIT_IP_MAX = '2';
      try {
        const remoteAddress = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
        const hit = () => app.inject({ method: 'GET', url: '/', remoteAddress });
        const results = [await hit(), await hit(), await hit()];
        expect(results.map((r) => r.statusCode)).toEqual([200, 200, 429]);
      } finally {
        delete process.env.RATE_LIMIT_IP_MAX;
      }
    });
  });
});
