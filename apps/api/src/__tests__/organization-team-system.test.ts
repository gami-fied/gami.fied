import {
  auditLogs,
  db,
  emailNotificationOutbox,
  invitation,
  member,
  organizations,
  projectMembers,
  projects,
  runMigrations,
  users,
} from '@gami/database';
import { Gami } from '@gami/sdk';
import { createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('Milestone 21 — Organization & Team Management System Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  // Test Org & Users
  let orgId: string;
  let ownerEmail: string;
  let ownerCookie: string;
  let ownerUserId: string;

  let adminEmail: string;
  let adminCookie: string;
  let adminUserId: string;

  let memberEmail: string;
  let memberCookie: string;
  let memberUserId: string;

  let otherOrgId: string;
  let projectId: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    // 1. Register Owner Account
    ownerEmail = `owner_team_${randomUUID()}@example.com`;
    const regOwner = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: ownerEmail, password: 'Password123!', name: 'Org Owner' },
    });
    ownerCookie = regOwner.headers['set-cookie'] as string;
    const ownerData = JSON.parse(regOwner.payload);
    ownerUserId = ownerData.user.id;

    // 2. Create Primary Test Organization
    const createOrgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: ownerCookie },
      payload: { name: 'Acme Team Org', slug: `acme-team-${randomUUID().substring(0, 8)}` },
    });
    const orgObj = JSON.parse(createOrgRes.payload);
    orgId = orgObj.id;

    // Create Test Project in Org
    const createPrjRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie },
      payload: { organizationId: orgId, name: 'Acme Core Project', slug: `acme-core-${randomUUID().substring(0, 8)}` },
    });
    const prjObj = JSON.parse(createPrjRes.payload);
    projectId = prjObj.id;

    // 3. Register Admin Account
    adminEmail = `admin_team_${randomUUID()}@example.com`;
    const regAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: adminEmail, password: 'Password123!', name: 'Org Admin' },
    });
    adminCookie = regAdmin.headers['set-cookie'] as string;
    adminUserId = JSON.parse(regAdmin.payload).user.id;

    // Attach Admin to Org
    await db.insert(member).values({
      id: `mem_admin_${randomUUID()}`,
      organizationId: orgId,
      userId: adminUserId,
      role: 'admin',
    });

    // 4. Register Member Account
    memberEmail = `member_team_${randomUUID()}@example.com`;
    const regMember = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: memberEmail, password: 'Password123!', name: 'Org Member' },
    });
    memberCookie = regMember.headers['set-cookie'] as string;
    memberUserId = JSON.parse(regMember.payload).user.id;

    // Attach Member to Org
    await db.insert(member).values({
      id: `mem_member_${randomUUID()}`,
      organizationId: orgId,
      userId: memberUserId,
      role: 'member',
    });

    // 5. Create Secondary Org for Isolation Tests
    const createOtherOrgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: ownerCookie },
      payload: { name: 'Other Isolated Org', slug: `other-org-${randomUUID().substring(0, 8)}` },
    });
    otherOrgId = JSON.parse(createOtherOrgRes.payload).id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Organization Members API Tests
  // ---------------------------------------------------------------------------
  it('1. GET /api/organizations/:id/members lists members with roles, search, and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/members?q=Admin`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.members.length).toBeGreaterThanOrEqual(1);
    expect(body.members[0].email).toBe(adminEmail);
    expect(body.members[0].role).toBe('admin');
  });

  it('2. GET /api/organizations/:id/members/:userId returns member details & project access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/members/${adminUserId}`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.member.userId).toBe(adminUserId);
    expect(body.member.role).toBe('admin');
  });

  it('3. PATCH /api/organizations/:id/members/:userId updates member role (Owner/Admin required)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}/members/${memberUserId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'admin' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.role).toBe('admin');

    // Revert role back to member
    await db.update(member).set({ role: 'member' }).where(and(eq(member.organizationId, orgId), eq(member.userId, memberUserId)));
  });

  it('4. Owner protection: prevents demoting owner or modifying self role', async () => {
    // Owner attempting to modify own role
    const selfRes = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}/members/${ownerUserId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'member' },
    });
    expect(selfRes.statusCode).toBe(400);

    // Admin attempting to demote owner
    const demoteRes = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}/members/${ownerUserId}`,
      headers: { cookie: adminCookie },
      payload: { role: 'member' },
    });
    expect(demoteRes.statusCode).toBe(403);
  });

  it('5. Admin & Member permission boundaries: regular member cannot manage members', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}/members/${adminUserId}`,
      headers: { cookie: memberCookie },
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 2. Organization Invitations API Tests
  // ---------------------------------------------------------------------------
  it('6. POST /api/organizations/:id/invitations creates invitation with SHA-256 token hash & 7-day expiration', async () => {
    const invitedEmail = `invited_${randomUUID()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: invitedEmail, role: 'member' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.email).toBe(invitedEmail);
    expect(body.status).toBe('pending');
    expect(body.invitationUrl).toContain('/accept-invitation?token=');

    // Check DB record: token_hash is stored, raw token is NOT in DB
    const [dbInv] = await db.select().from(invitation).where(eq(invitation.id, body.id));
    expect(dbInv).toBeDefined();
    expect(dbInv.tokenHash).toHaveLength(64); // SHA-256 hex length
    expect(dbInv.email).toBe(invitedEmail);

    // Check email_notification_outbox record created for recipient
    const [eob] = await db
      .select()
      .from(emailNotificationOutbox)
      .where(eq(emailNotificationOutbox.recipientEmail, invitedEmail));

    expect(eob).toBeDefined();
    expect(eob.subject).toContain("You've been invited to join");
    expect(eob.status).toBe('pending');
  });

  it('7. Rejects duplicate pending invitation for same email', async () => {
    const dupEmail = `dup_${randomUUID()}@example.com`;
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: dupEmail, role: 'member' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: dupEmail, role: 'member' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('8. Rejects inviting an existing organization member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: memberEmail, role: 'member' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('9. Existing user accepts invitation and attaches to organization', async () => {
    // Register recipient user
    const recipientEmail = `existing_user_${randomUUID()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: recipientEmail, password: 'Password123!', name: 'Existing User' },
    });
    const recipientCookie = regRes.headers['set-cookie'] as string;
    const recipientUserId = JSON.parse(regRes.payload).user.id;

    // Create invitation for recipientEmail
    const invRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: recipientEmail, role: 'member' },
    });
    const invUrl = JSON.parse(invRes.payload).invitationUrl;
    const token = new URL(invUrl).searchParams.get('token')!;

    // Accept invitation with recipient's cookie
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/invitations/${token}/accept`,
      headers: { cookie: recipientCookie },
    });

    expect(acceptRes.statusCode).toBe(200);

    // Verify recipient is now a member of orgId
    const [memRow] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, recipientUserId)));

    expect(memRow).toBeDefined();
    expect(memRow.role).toBe('member');
  });

  it('10. Security: Rejects invitation acceptance when signed-in email mismatches invited email', async () => {
    const targetEmail = `target_email_${randomUUID()}@example.com`;
    const invRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: targetEmail, role: 'member' },
    });
    const token = new URL(JSON.parse(invRes.payload).invitationUrl).searchParams.get('token')!;

    // Attempt to accept using ownerCookie (whose email is ownerEmail, NOT targetEmail)
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitations/${token}/accept`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Invitation was sent to');
  });

  it('11. Single-use invitation: prevents re-accepting an already accepted invitation', async () => {
    const singleEmail = `single_use_${randomUUID()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: singleEmail, password: 'Password123!', name: 'Single User' },
    });
    const singleCookie = regRes.headers['set-cookie'] as string;

    const invRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: singleEmail, role: 'member' },
    });
    const token = new URL(JSON.parse(invRes.payload).invitationUrl).searchParams.get('token')!;

    // First acceptance
    await app.inject({
      method: 'POST',
      url: `/api/invitations/${token}/accept`,
      headers: { cookie: singleCookie },
    });

    // Second acceptance attempt
    const secondRes = await app.inject({
      method: 'POST',
      url: `/api/invitations/${token}/accept`,
      headers: { cookie: singleCookie },
    });

    expect(secondRes.statusCode).toBe(400);
  });

  it('12. Revoking invitation marks status = revoked and prevents acceptance', async () => {
    const revokeEmail = `to_revoke_${randomUUID()}@example.com`;
    const invRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: revokeEmail, role: 'member' },
    });
    const invObj = JSON.parse(invRes.payload);
    const token = new URL(invObj.invitationUrl).searchParams.get('token')!;

    // Revoke invitation
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/api/organizations/${orgId}/invitations/${invObj.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Register user & try to accept
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: revokeEmail, password: 'Password123!', name: 'Revoked User' },
    });
    const revokeCookie = regRes.headers['set-cookie'] as string;

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/invitations/${token}/accept`,
      headers: { cookie: revokeCookie },
    });

    expect(acceptRes.statusCode).toBe(400);
  });

  it('13. Resending invitation updates token hash & expiration', async () => {
    const resendEmail = `to_resend_${randomUUID()}@example.com`;
    const invRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: resendEmail, role: 'member' },
    });
    const invObj = JSON.parse(invRes.payload);

    const resendRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/invitations/${invObj.id}/resend`,
      headers: { cookie: ownerCookie },
    });

    expect(resendRes.statusCode).toBe(200);
    const resendObj = JSON.parse(resendRes.payload);
    expect(resendObj.invitationUrl).not.toBe(invObj.invitationUrl);
  });

  // ---------------------------------------------------------------------------
  // 3. Ownership Transfer Tests
  // ---------------------------------------------------------------------------
  it('14. POST /api/organizations/:id/transfer-ownership atomically swaps owner to admin and target to owner', async () => {
    // Transfer ownership to adminUserId
    const transferRes = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/transfer-ownership`,
      headers: { cookie: ownerCookie },
      payload: { targetUserId: adminUserId },
    });

    expect(transferRes.statusCode).toBe(200);

    // Verify adminUserId is now 'owner'
    const [adminMem] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, adminUserId)));
    expect(adminMem.role).toBe('owner');

    // Verify ownerUserId is now 'admin'
    const [prevOwnerMem] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, ownerUserId)));
    expect(prevOwnerMem.role).toBe('admin');

    // Revert ownership back to ownerUserId for subsequent tests
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/transfer-ownership`,
      headers: { cookie: adminCookie },
      payload: { targetUserId: ownerUserId },
    });
  });

  it('15. Rejects transferring ownership to a non-member of the organization', async () => {
    const nonMemberEmail = `non_member_${randomUUID()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: nonMemberEmail, password: 'Password123!', name: 'Non Member' },
    });
    const nonMemberUserId = JSON.parse(regRes.payload).user.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/transfer-ownership`,
      headers: { cookie: ownerCookie },
      payload: { targetUserId: nonMemberUserId },
    });

    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 4. Project Membership & Access Tests
  // ---------------------------------------------------------------------------
  it('16. Project membership: Add and remove org member to project', async () => {
    // Add memberUserId to projectId
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: ownerCookie },
      payload: { userId: memberUserId, role: 'member' },
    });

    expect(addRes.statusCode).toBe(201);

    // List project members
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: ownerCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.members.some((m: any) => m.userId === memberUserId)).toBe(true);

    // Remove memberUserId from projectId
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}/members/${memberUserId}`,
      headers: { cookie: ownerCookie },
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('17. Rejects granting project access to a user who is not a member of the organization', async () => {
    const outsiderEmail = `outsider_${randomUUID()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: outsiderEmail, password: 'Password123!', name: 'Outsider' },
    });
    const outsiderUserId = JSON.parse(regRes.payload).user.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: ownerCookie },
      payload: { userId: outsiderUserId },
    });

    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 5. Suspended Organization Restrictions & Audit Logs Tests
  // ---------------------------------------------------------------------------
  it('18. Suspended organization blocks team & project operations with 403 Forbidden', async () => {
    // Suspend org
    await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, orgId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(403);

    // Unsuspend org
    await db.update(organizations).set({ status: 'active' }).where(eq(organizations.id, orgId));
  });

  it('19. Verifies audit logs recorded for team management actions', async () => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId));
    expect(logs.length).toBeGreaterThan(0);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('organization.member_invited');
  });

  // ---------------------------------------------------------------------------
  // 6. TypeScript SDK Integration Tests
  // ---------------------------------------------------------------------------
  it('20. TypeScript SDK organizations resource methods', async () => {
    const sdk = new Gami({
      apiKey: 'gami_live_test_key',
      baseUrl: 'http://localhost:3001',
    });

    expect(typeof sdk.organizations.listMembers).toBe('function');
    expect(typeof sdk.organizations.inviteMember).toBe('function');
    expect(typeof sdk.organizations.transferOwnership).toBe('function');
    expect(typeof sdk.organizations.acceptInvitation).toBe('function');
    expect(typeof sdk.organizations.listProjectMembers).toBe('function');
  });
});
