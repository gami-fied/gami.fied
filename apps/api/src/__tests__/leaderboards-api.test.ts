import { randomUUID } from 'crypto';
import {
  checkDatabaseHealth,
  db,
  endUsers,
  member,
  organizations,
  projects,
  users,
  userXpBalances,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('Milestone 11 - Leaderboards & Rankings API Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  let orgId: string;
  let projectId: string;
  let projectBId: string;
  let user1: string;
  let user2: string;
  let cookieHeader: string;

  beforeAll(async () => {
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);

    app = await buildServer();

    // Register & Login Dashboard User to obtain Session Cookie
    const userEmail = `admin_lb_${randomUUID()}@example.com`;
    const password = 'Password123!';

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: userEmail,
        password,
        name: 'Leaderboard Admin',
      },
    });
    expect(regRes.statusCode).toBe(200);

    const cookies = regRes.headers['set-cookie'];
    cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';

    const [registeredUser] = await db.select().from(users).where(eq(users.email, userEmail));

    // Create Organization & Projects
    orgId = `org_api_lb_${randomUUID()}`;
    projectId = `prj_api_lb_${randomUUID()}`;
    projectBId = `prj_api_lbb_${randomUUID()}`;

    await db.insert(organizations).values({
      id: orgId,
      name: 'Leaderboard API Org',
      slug: `lb-api-org-${randomUUID()}`,
    });

    await db.insert(member).values({
      id: `mem_lb_${randomUUID()}`,
      organizationId: orgId,
      userId: registeredUser.id,
      role: 'owner',
    });

    await db.insert(projects).values([
      {
        id: projectId,
        organizationId: orgId,
        name: 'Project Alpha',
        slug: `alpha-${randomUUID()}`,
      },
      { id: projectBId, organizationId: orgId, name: 'Project Beta', slug: `beta-${randomUUID()}` },
    ]);

    // Create End Users
    user1 = `usr_api_1_${randomUUID()}`;
    user2 = `usr_api_2_${randomUUID()}`;

    await db.insert(endUsers).values([
      { id: user1, projectId, externalId: 'ext_api_alice', name: 'Alice Leaderboard' },
      { id: user2, projectId, externalId: 'ext_api_bob', name: 'Bob Leaderboard' },
    ]);

    await db.insert(userXpBalances).values([
      { id: `uxb_api_1_${randomUUID()}`, projectId, userId: user1, totalXp: 1000 },
      { id: `uxb_api_2_${randomUUID()}`, projectId, userId: user2, totalXp: 500 },
    ]);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('1. GET /api/projects/:projectId/leaderboard returns paginated leaderboard with period, rank, and XP', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/leaderboard?period=all_time&page=1&limit=10`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.period).toBe('all_time');
    expect(body.total).toBe(2);
    expect(body.entries.length).toBe(2);

    expect(body.entries[0].userId).toBe(user1);
    expect(body.entries[0].rank).toBe(1);
    expect(body.entries[0].xp).toBe(1000);
    expect(body.entries[0].externalId).toBe('ext_api_alice');

    expect(body.entries[1].userId).toBe(user2);
    expect(body.entries[1].rank).toBe(2);
    expect(body.entries[1].xp).toBe(500);
  });

  it('2. Search by external_id or name returns matched user with PRESERVED global rank', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/leaderboard?search=Bob`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.total).toBe(1);
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].userId).toBe(user2);
    // Global rank must be preserved as 2, NOT renumbered to 1!
    expect(body.entries[0].rank).toBe(2);
  });

  it('3. GET /api/projects/:projectId/leaderboard/:userId returns target user rank', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/leaderboard/${user1}`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.rank).toBe(1);
    expect(body.totalUsers).toBe(2);
    expect(body.entry.userId).toBe(user1);
    expect(body.entry.xp).toBe(1000);
  });

  it('4. Tenant protection: Unauthenticated or unauthorized project request is rejected', async () => {
    const unauthRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/leaderboard`,
    });
    expect(unauthRes.statusCode).toBe(401);
  });
});
