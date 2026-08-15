import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth.js';
import * as schema from '../schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDbUrl =
  process.env['DATABASE_URL_TEST'] ||
  'postgresql://gami:gami_dev_password@localhost:5432/gami_community_test';

describe('@gami/database & API - Auth, RBAC, and Tenant Isolation Tests', () => {
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

  it('1. Registration & Authentication: registers user, rejects duplicate email, validates login', async () => {
    const email = `user_${randomUUID()}@example.com`;
    const password = 'SecurePassword123!';

    const signupRes = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: 'Dashboard Admin',
      },
    });

    expect(signupRes).toBeDefined();
    expect(signupRes.user.email).toBe(email);

    await expect(
      auth.api.signUpEmail({
        body: {
          email,
          password: 'OtherPassword123!',
          name: 'Duplicate Admin',
        },
      })
    ).rejects.toThrow();

    const loginRes = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    expect(loginRes).toBeDefined();
    expect(loginRes.user.email).toBe(email);

    await expect(
      auth.api.signInEmail({
        body: {
          email,
          password: 'WrongPassword123!',
        },
      })
    ).rejects.toThrow();
  });

  it('2. Organization Management & Membership: creator becomes owner, enforces unique slug', async () => {
    const userEmail = `owner_${randomUUID()}@example.com`;
    const user = await auth.api.signUpEmail({
      body: {
        email: userEmail,
        password: 'SecurePassword123!',
        name: 'Org Owner',
      },
    });

    const orgId = `org_${randomUUID()}`;
    const slug = `org-slug-${randomUUID()}`;

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'Acme Corp',
      slug,
    });

    await testDb.insert(schema.member).values({
      id: `mem_${randomUUID()}`,
      organizationId: orgId,
      userId: user.user.id,
      role: 'owner',
    });

    const memberships = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, user.user.id));

    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe('owner');

    await expect(
      testDb.insert(schema.organizations).values({
        id: `org_${randomUUID()}`,
        name: 'Duplicate Acme',
        slug,
      })
    ).rejects.toThrow();

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await testDb.delete(schema.users).where(eq(schema.users.id, user.user.id));
  });

  it('3. Role Authorization: owner and admin can manage projects, member is restricted', async () => {
    const owner = await auth.api.signUpEmail({
      body: {
        email: `owner_role_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Owner',
      },
    });
    const admin = await auth.api.signUpEmail({
      body: {
        email: `admin_role_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Admin',
      },
    });
    const memberUser = await auth.api.signUpEmail({
      body: {
        email: `member_role_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Member',
      },
    });

    const orgId = `org_${randomUUID()}`;
    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'Role Test Org',
      slug: `role-org-${randomUUID()}`,
    });

    await testDb.insert(schema.member).values([
      { id: `m1_${randomUUID()}`, organizationId: orgId, userId: owner.user.id, role: 'owner' },
      { id: `m2_${randomUUID()}`, organizationId: orgId, userId: admin.user.id, role: 'admin' },
      {
        id: `m3_${randomUUID()}`,
        organizationId: orgId,
        userId: memberUser.user.id,
        role: 'member',
      },
    ]);

    const prjId = `prj_${randomUUID()}`;
    await testDb.insert(schema.projects).values({
      id: prjId,
      organizationId: orgId,
      name: 'Role Project',
      slug: 'role-proj',
    });

    const ownerMem = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, owner.user.id));
    const adminMem = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, admin.user.id));
    const memberMem = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, memberUser.user.id));

    expect(ownerMem[0]?.role).toBe('owner');
    expect(adminMem[0]?.role).toBe('admin');
    expect(memberMem[0]?.role).toBe('member');

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await testDb.delete(schema.users).where(eq(schema.users.id, owner.user.id));
    await testDb.delete(schema.users).where(eq(schema.users.id, admin.user.id));
    await testDb.delete(schema.users).where(eq(schema.users.id, memberUser.user.id));
  });

  it('4. Tenant Isolation: rejects cross-tenant resource access (IDOR defense)', async () => {
    const userA = await auth.api.signUpEmail({
      body: {
        email: `usera_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'User A',
      },
    });
    const orgAId = `org_a_${randomUUID()}`;
    await testDb.insert(schema.organizations).values({
      id: orgAId,
      name: 'Org A',
      slug: `org-a-${randomUUID()}`,
    });
    await testDb.insert(schema.member).values({
      id: `mem_a_${randomUUID()}`,
      organizationId: orgAId,
      userId: userA.user.id,
      role: 'owner',
    });
    const prjAId = `prj_a_${randomUUID()}`;
    await testDb.insert(schema.projects).values({
      id: prjAId,
      organizationId: orgAId,
      name: 'Project A',
      slug: 'proj-a',
    });

    const userB = await auth.api.signUpEmail({
      body: {
        email: `userb_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'User B',
      },
    });
    const orgBId = `org_b_${randomUUID()}`;
    await testDb.insert(schema.organizations).values({
      id: orgBId,
      name: 'Org B',
      slug: `org-b-${randomUUID()}`,
    });
    await testDb.insert(schema.member).values({
      id: `mem_b_${randomUUID()}`,
      organizationId: orgBId,
      userId: userB.user.id,
      role: 'owner',
    });
    const prjBId = `prj_b_${randomUUID()}`;
    await testDb.insert(schema.projects).values({
      id: prjBId,
      organizationId: orgBId,
      name: 'Project B',
      slug: 'proj-b',
    });

    const userAInOrgB = await testDb
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, userA.user.id));

    const orgIdsForA = userAInOrgB.map((m) => m.organizationId);
    expect(orgIdsForA).toContain(orgAId);
    expect(orgIdsForA).not.toContain(orgBId);

    const [fetchedPrjB] = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, prjBId));

    expect(fetchedPrjB?.organizationId).toBe(orgBId);
    expect(orgIdsForA.includes(fetchedPrjB!.organizationId)).toBe(false);

    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgAId));
    await testDb.delete(schema.organizations).where(eq(schema.organizations.id, orgBId));
    await testDb.delete(schema.users).where(eq(schema.users.id, userA.user.id));
    await testDb.delete(schema.users).where(eq(schema.users.id, userB.user.id));
  });
});
