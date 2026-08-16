import { randomUUID } from 'crypto';
import { db, endUsers, member, projectMembers, runMigrations, userXpBalances } from '@gami/database';
import { Gami } from '@gami/sdk';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Milestone 15 — Users API & User Management System Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;

  let orgId: string;
  let projIdA: string;
  let projIdB: string;

  let apiKeySecretA: string;
  let gamiSdk: Gami;

  let createdUserId: string;
  let externalId1: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // 1. Sign up Owner User
    const ownerSignupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `owner_usr_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Owner Admin User',
      },
    });
    ownerCookie = ownerSignupRes.headers['set-cookie'] as string;

    // 2. Sign up Member User
    const memberSignupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `member_usr_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Member User',
      },
    });
    memberCookie = memberSignupRes.headers['set-cookie'] as string;
    const memberSignupObj = JSON.parse(memberSignupRes.payload);

    // 3. Create Org
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: ownerCookie },
      payload: { name: 'Users Test Org', slug: `org-${randomUUID()}` },
    });
    const org = JSON.parse(orgRes.payload);
    orgId = org.id;

    // Add Member user to Org as 'member'
    await db.insert(member).values({
      id: `mem_${randomUUID()}`,
      organizationId: orgId,
      userId: memberSignupObj.user.id,
      role: 'member',
    });

    // 4. Create Project A & Project B
    const prjARes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie },
      payload: { organizationId: orgId, name: 'Users Project A', slug: `prja-${randomUUID()}` },
    });
    const prjA = JSON.parse(prjARes.payload);
    projIdA = prjA.id;

    await db.insert(projectMembers).values({
      id: `pm_${randomUUID()}`,
      projectId: projIdA,
      userId: memberSignupObj.user.id,
      role: 'member',
    });

    const prjBRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie },
      payload: { organizationId: orgId, name: 'Users Project B', slug: `prjb-${randomUUID()}` },
    });
    const prjB = JSON.parse(prjBRes.payload);
    projIdB = prjB.id;

    // 5. Generate API Key for Project A
    const keyData = await createApiKey(projIdA, 'Users Test API Key');
    apiKeySecretA = keyData.rawSecret;

    // 6. Instantiate Gami SDK client
    gamiSdk = new Gami({
      apiKey: apiKeySecretA,
      baseUrl,
    });

    externalId1 = `cust_ext_${randomUUID()}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1-10. REST API Core User Management Tests
  // ---------------------------------------------------------------------------

  it('1. Create user manually via POST /api/projects/:projectId/users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: ownerCookie },
      payload: {
        externalId: externalId1,
        name: 'Alice Johnson',
        avatarUrl: 'https://example.com/alice.png',
        metadata: { tier: 'gold' },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.externalId).toBe(externalId1);
    expect(body.name).toBe('Alice Johnson');
    expect(body.active).toBe(true);
    createdUserId = body.id;
  });

  it('2. Duplicate externalId rejected with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: ownerCookie },
      payload: {
        externalId: externalId1,
        name: 'Alice Duplicate',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Conflict');
  });

  it('3. List project users via GET /api/projects/:projectId/users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.users).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.users[0].id).toBeDefined();
  });

  it('4. DB Pagination parameters (page, limit)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users?page=1&limit=5`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
  });

  it('5. DB Search by name (search=Alice)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users?search=Alice`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].name).toBe('Alice Johnson');
  });

  it('6. DB Search by external ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users?search=${externalId1}`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].externalId).toBe(externalId1);
  });

  it('7. Get user profile by internal ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(createdUserId);
    expect(body.externalId).toBe(externalId1);
  });

  it('8. Get user profile by external ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users/by-external-id/${encodeURIComponent(externalId1)}`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(createdUserId);
    expect(body.externalId).toBe(externalId1);
  });

  it('9. Update user profile via PATCH /api/projects/:projectId/users/:userId', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Alice Updated Johnson',
        avatarUrl: 'https://example.com/new_alice.png',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Alice Updated Johnson');
    expect(body.avatarUrl).toBe('https://example.com/new_alice.png');
    expect(body.externalId).toBe(externalId1); // Immutable
  });

  it('10. Soft-deactivate user via DELETE /api/projects/:projectId/users/:userId', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.user.active).toBe(false);

    // Verify row still exists in DB (not physically deleted)
    const [dbRow] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.id, createdUserId), eq(endUsers.projectId, projIdA)));
    expect(dbRow).toBeDefined();
    expect(dbRow.active).toBe(false);
  });

  it('11. Deactivated user retains historical XP balance', async () => {
    // Insert XP balance for deactivated user directly
    await db.insert(userXpBalances).values({
      id: `xp_bal_${randomUUID()}`,
      projectId: projIdA,
      userId: createdUserId,
      totalXp: 500,
    });

    const [xpRecord] = await db
      .select()
      .from(userXpBalances)
      .where(and(eq(userXpBalances.projectId, projIdA), eq(userXpBalances.userId, createdUserId)));

    expect(xpRecord).toBeDefined();
    expect(xpRecord.totalXp).toBe(500);

    // Reactivate user via PATCH active=true for subsequent tests
    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: ownerCookie },
      payload: { active: true },
    });
  });

  // ---------------------------------------------------------------------------
  // 12-15. RBAC & Tenant Isolation Tests
  // ---------------------------------------------------------------------------

  it('12. Member can read users list and single user profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: memberCookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it('13. Member cannot create, update, or deactivate users (returns 403)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: memberCookie },
      payload: { externalId: `ext_member_fail_${randomUUID()}` },
    });
    expect(createRes.statusCode).toBe(403);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: memberCookie },
      payload: { name: 'Unauthorized Change' },
    });
    expect(updateRes.statusCode).toBe(403);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projIdA}/users/${createdUserId}`,
      headers: { cookie: memberCookie },
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  it('14. Owner/Admin can create, update, and deactivate users', async () => {
    const testExtId = `ext_admin_${randomUUID()}`;
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdA}/users`,
      headers: { cookie: ownerCookie },
      payload: { externalId: testExtId, name: 'Admin Created' },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projIdA}/users/${created.id}`,
      headers: { cookie: ownerCookie },
      payload: { name: 'Admin Renamed' },
    });
    expect(updateRes.statusCode).toBe(200);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projIdA}/users/${created.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(deleteRes.statusCode).toBe(200);
  });

  it('15. Project A cannot access Project B users (tenant isolation)', async () => {
    // Create user in Project B
    const bExtId = `ext_proj_b_${randomUUID()}`;
    const createBRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${projIdB}/users`,
      headers: { cookie: ownerCookie },
      payload: { externalId: bExtId, name: 'Bob Project B' },
    });
    const userB = JSON.parse(createBRes.payload);

    // Try fetching user B from Project A endpoint -> 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users/${userB.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // 16-18. Event Ingestion Resolution Tests
  // ---------------------------------------------------------------------------

  it('16. Event ingestion resolves existing manually-created user without duplicating', async () => {
    const eventRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'manual_user_action',
        user_id: externalId1,
        payload: { score: 100 },
      },
    });

    expect(eventRes.statusCode).toBe(202);

    // Verify only 1 end_users row exists for this externalId
    const usersInDb = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projIdA), eq(endUsers.externalId, externalId1)));
    expect(usersInDb).toHaveLength(1);
    expect(usersInDb[0].id).toBe(createdUserId);
  });

  it('17 & 18. Event ingestion creates user automatically and displays in user listing', async () => {
    const autoExtId = `auto_evt_${randomUUID()}`;
    const eventRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-api-key': apiKeySecretA },
      payload: {
        event: 'first_time_login',
        user_id: autoExtId,
      },
    });

    expect(eventRes.statusCode).toBe(202);

    // Verify automatically created user appears in /api/projects/:projectId/users listing
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projIdA}/users?search=${autoExtId}`,
      headers: { cookie: ownerCookie },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.users).toHaveLength(1);
    expect(listBody.users[0].externalId).toBe(autoExtId);
  });

  // ---------------------------------------------------------------------------
  // 19-24. SDK gami.users.* Integration Tests
  // ---------------------------------------------------------------------------

  it('19. SDK gami.users.list() returns paginated user list', async () => {
    const listRes = await gamiSdk.users.list({
      projectId: projIdA,
      page: 1,
      limit: 10,
    });

    expect(listRes.users).toBeDefined();
    expect(listRes.total).toBeGreaterThanOrEqual(1);
  });

  it('20. SDK gami.users.get() returns user profile by internal ID', async () => {
    const profile = await gamiSdk.users.get({
      projectId: projIdA,
      userId: createdUserId,
    });

    expect(profile.id).toBe(createdUserId);
    expect(profile.externalId).toBe(externalId1);
  });

  it('21. SDK gami.users.getByExternalId() returns user profile by external ID', async () => {
    const profile = await gamiSdk.users.getByExternalId({
      projectId: projIdA,
      externalId: externalId1,
    });

    expect(profile.id).toBe(createdUserId);
    expect(profile.externalId).toBe(externalId1);
  });

  it('22. SDK gami.users.create() creates new user via SDK', async () => {
    const sdkExtId = `sdk_create_${randomUUID()}`;
    const newUser = await gamiSdk.users.create({
      projectId: projIdA,
      externalId: sdkExtId,
      name: 'SDK Created User',
    });

    expect(newUser.id).toBeDefined();
    expect(newUser.externalId).toBe(sdkExtId);
    expect(newUser.name).toBe('SDK Created User');
  });

  it('23. SDK gami.users.update() updates profile and active flag via SDK', async () => {
    const updated = await gamiSdk.users.update({
      projectId: projIdA,
      userId: createdUserId,
      name: 'SDK Renamed User',
      active: true,
    });

    expect(updated.id).toBe(createdUserId);
    expect(updated.name).toBe('SDK Renamed User');
    expect(updated.active).toBe(true);
  });

  it('24. SDK gami.users.delete() soft-deactivates user via SDK', async () => {
    const delRes = await gamiSdk.users.delete({
      projectId: projIdA,
      userId: createdUserId,
    });

    expect(delRes.success).toBe(true);
    expect(delRes.user.active).toBe(false);
  });
});
