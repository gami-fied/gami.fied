import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  member,
  organizations,
  projectMembers,
  projects,
  runMigrations,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('Dashboard access', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let ownerCookie: string;
  let memberCookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_acc_${suffix}`;
  const projectId = `prj_acc_${suffix}`;
  const hiddenProjectId = `prj_acc_hidden_${suffix}`;
  const userId = `usr_acc_${suffix}`;

  const signUp = async (label: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `${label}_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: label,
      },
    });
    return {
      id: JSON.parse(res.payload).user.id as string,
      cookie: res.headers['set-cookie'] as string,
    };
  };

  const get = (url: string, cookie: string) =>
    app.inject({ method: 'GET', url, headers: { cookie } });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Access', slug: `acc-${suffix}` });
    await db.insert(projects).values([
      { id: projectId, organizationId: orgId, name: 'Shown', slug: 'shown' },
      { id: hiddenProjectId, organizationId: orgId, name: 'Hidden', slug: 'hidden' },
    ]);
    await db.insert(endUsers).values({
      id: userId,
      projectId,
      externalId: `ext_${suffix}`,
      email: 'person@example.com',
    });

    const owner = await signUp('owner');
    const plain = await signUp('member');
    ownerCookie = owner.cookie;
    memberCookie = plain.cookie;
    await db.insert(member).values([
      { id: `m_o_${suffix}`, organizationId: orgId, userId: owner.id, role: 'owner', createdAt: new Date() },
      { id: `m_m_${suffix}`, organizationId: orgId, userId: plain.id, role: 'member', createdAt: new Date() },
    ]);
    await db.insert(projectMembers).values({
      id: `pm_${suffix}`,
      projectId,
      userId: plain.id,
      role: 'member',
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('end-user email addresses', () => {
    it('are visible to owners', async () => {
      const res = await get(`/api/projects/${projectId}/users`, ownerCookie);
      expect(JSON.parse(res.payload).users[0].email).toBe('person@example.com');
    });

    it('are hidden from plain members in the list', async () => {
      const res = await get(`/api/projects/${projectId}/users`, memberCookie);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).users[0].email).toBeNull();
    });

    it('are hidden from plain members on a single user', async () => {
      const res = await get(`/api/projects/${projectId}/users/${userId}`, memberCookie);
      expect(JSON.parse(res.payload).email).toBeNull();
    });

    it('are hidden by external ID', async () => {
      const url = `/api/projects/${projectId}/users/by-external-id/ext_${suffix}`;
      const res = await get(url, memberCookie);
      expect(JSON.parse(res.payload).email).toBeNull();
    });

    it('are left out of a member CSV export', async () => {
      const url = `/api/projects/${projectId}/analytics/export?type=users&range=30d`;
      const res = await get(url, memberCookie);
      expect(res.statusCode).toBe(200);
      expect(res.payload).not.toContain('person@example.com');
    });
  });

  describe('project access', () => {
    it('still refuses a project a member is not assigned to', async () => {
      const res = await get(`/api/projects/${hiddenProjectId}/users`, memberCookie);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('bootstrap', () => {
    it('returns organizations and all their projects for an owner', async () => {
      const res = await get(`/api/bootstrap?organizationId=${orgId}`, ownerCookie);
      const body = JSON.parse(res.payload);

      expect(res.statusCode).toBe(200);
      expect(body.organizationId).toBe(orgId);
      expect(body.organizations.find((o: { id: string }) => o.id === orgId).role).toBe('owner');
      expect(body.projects).toHaveLength(2);
    });

    it('only returns assigned projects for a member', async () => {
      const res = await get(`/api/bootstrap?organizationId=${orgId}`, memberCookie);
      const body = JSON.parse(res.payload);

      expect(body.projects.map((p: { id: string }) => p.id)).toEqual([projectId]);
    });

    it('ignores an organization the user does not belong to', async () => {
      const res = await get('/api/bootstrap?organizationId=org_missing', memberCookie);
      expect(JSON.parse(res.payload).organizationId).toBe(orgId);
    });
  });

  describe('overview', () => {
    it('returns stats, activity and setup in one call', async () => {
      const res = await get(`/api/projects/${projectId}/overview`, ownerCookie);
      const body = JSON.parse(res.payload);

      expect(res.statusCode).toBe(200);
      expect(body.stats).toMatchObject({ totalUsers: 1, eventsToday: 0, ruleCount: 0 });
      expect(body.setup.totalSteps).toBeGreaterThan(0);
      expect(Array.isArray(body.recentEvents)).toBe(true);
    });
  });
});
