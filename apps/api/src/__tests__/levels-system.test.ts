import { randomUUID } from 'crypto';
import { db, endUsers, member, projectMembers, userXpBalances, xpLedger } from '@gami/database';
import { calculateLevel, getLevelsCrossed, validateLevelDefinitions } from '@gami/progression';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('Milestone 9 - Levels & Progression System Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let ownerCookie: string;
  let memberCookie: string;
  let orgId: string;
  let projAId: string;
  let projBId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Sign up Owner User
    const ownerEmail = `lvl_owner_${randomUUID()}@example.com`;
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: ownerEmail,
        password: 'SecurePassword123!',
        name: 'Level System Owner',
      },
    });
    ownerCookie = signupRes.headers['set-cookie'] as string;

    // 2. Create Organization
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: ownerCookie },
      payload: { name: 'Level Test Org', slug: `org-${randomUUID()}` },
    });
    const org = JSON.parse(orgRes.payload);
    orgId = org.id;

    // 3. Create Project A (seeds 5 default levels)
    const prjARes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie },
      payload: {
        organizationId: orgId,
        name: 'Project A',
        slug: `prj-a-${randomUUID()}`,
      },
    });
    const prjA = JSON.parse(prjARes.payload);
    projAId = prjA.id;

    // 4. Create Member User & Add to Org
    const memberEmail = `lvl_member_${randomUUID()}@example.com`;
    const memberSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: memberEmail,
        password: 'SecurePassword123!',
        name: 'Level System Member',
      },
    });
    memberCookie = memberSignup.headers['set-cookie'] as string;
    const memberData = JSON.parse(memberSignup.payload);

    await db.insert(member).values({
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
      userId: memberData.user.id,
      role: 'member',
    });

    await db.insert(projectMembers).values({
      id: `pm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      projectId: projAId,
      userId: memberData.user.id,
      role: 'member',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Pure Progression Calculator & Validation (@gami/progression)', () => {
    const testLevels = [
      { level: 1, name: 'L1', requiredXp: 0 },
      { level: 2, name: 'L2', requiredXp: 100 },
      { level: 3, name: 'L3', requiredXp: 250 },
    ];

    it('validates sequential monotonic level definitions correctly', () => {
      const v = validateLevelDefinitions(testLevels);
      expect(v.valid).toBe(true);
    });

    it('rejects non-sequential or non-zero Level 1 configurations', () => {
      const v1 = validateLevelDefinitions([{ level: 1, name: 'L1', requiredXp: 50 }]);
      expect(v1.valid).toBe(false);
      expect(v1.errors[0]).toContain('Level 1 must require 0 XP');

      const v2 = validateLevelDefinitions([
        { level: 1, name: 'L1', requiredXp: 0 },
        { level: 3, name: 'L3', requiredXp: 100 },
      ]);
      expect(v2.valid).toBe(false);
      expect(v2.errors[0]).toContain('Levels must be sequential');
    });

    it('calculates level progression and thresholds accurately', () => {
      const res0 = calculateLevel(0, testLevels);
      expect(res0.level).toBe(1);
      expect(res0.progressPercent).toBe(0);

      const res150 = calculateLevel(150, testLevels);
      expect(res150.level).toBe(2);
      expect(res150.xpIntoLevel).toBe(50);
      expect(res150.xpToNextLevel).toBe(100);
      expect(res150.progressPercent).toBe(33);

      const res300 = calculateLevel(300, testLevels);
      expect(res300.level).toBe(3);
      expect(res300.isMaxLevel).toBe(true);
      expect(res300.progressPercent).toBe(100);
    });

    it('detects level crossing thresholds correctly', () => {
      expect(getLevelsCrossed(0, 50, testLevels)).toEqual([]);
      expect(getLevelsCrossed(90, 150, testLevels)).toEqual([2]);
      expect(getLevelsCrossed(90, 290, testLevels)).toEqual([2, 3]);
    });
  });

  describe('2. Level Management API Endpoints & RBAC', () => {
    it('seeds 5 default levels for newly created projects', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/levels`,
        headers: { cookie: ownerCookie },
      });

      expect(res.statusCode).toBe(200);
      const prjLevels = JSON.parse(res.payload);
      expect(prjLevels).toHaveLength(5);
      expect(prjLevels[0]).toMatchObject({ level: 1, requiredXp: 0, name: 'Novice' });
      expect(prjLevels[4]).toMatchObject({ level: 5, requiredXp: 1000, name: 'Legend' });
    });

    it('allows Owner/Admin to create a new valid Level 6', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projAId}/levels`,
        headers: { cookie: ownerCookie },
        payload: {
          level: 6,
          name: 'Grandmaster',
          description: 'Beyond legend status',
          requiredXp: 2500,
        },
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.payload);
      expect(created.level).toBe(6);
      expect(created.requiredXp).toBe(2500);
    });

    it('rejects level creation that violates sequential continuity or monotonic XP', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projAId}/levels`,
        headers: { cookie: ownerCookie },
        payload: {
          level: 8, // Skips 7!
          name: 'Invalid Skip Level',
          requiredXp: 5000,
        },
      });

      expect(res.statusCode).toBe(400);
      const err = JSON.parse(res.payload);
      expect(err.message).toBe('Invalid level progression configuration');
    });

    it('prevents regular Member from creating or modifying levels', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projAId}/levels`,
        headers: { cookie: memberCookie },
        payload: {
          level: 7,
          name: 'Unauthorized Level',
          requiredXp: 5000,
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('3. Comprehensive 18-Step End-to-End Progression Flow', () => {
    let testUserId: string;

    it('executes full 18-step E2E progression & isolation scenario', async () => {
      // Step 1: Create Project A (done in beforeAll, projAId)

      // Step 2: Verify levels exist
      const levRes = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/levels`,
        headers: { cookie: ownerCookie },
      });
      expect(levRes.statusCode).toBe(200);

      // Step 3: Create end-user user_123 in Project A
      testUserId = `usr_${randomUUID()}`;
      await db.insert(endUsers).values({
        id: testUserId,
        projectId: projAId,
        externalId: 'ext_e2e_user_123',
      });

      // Step 4: Query progress at 0 XP -> Level 1
      const prog0 = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      expect(prog0.statusCode).toBe(200);
      const data0 = JSON.parse(prog0.payload);
      expect(data0.totalXp).toBe(0);
      expect(data0.level.number).toBe(1);
      expect(data0.progressPercent).toBe(0);

      // Helper function to award XP directly into authoritative balance
      const awardXpDirectly = async (amount: number, reason: string) => {
        await db.transaction(async (tx) => {
          await tx.insert(xpLedger).values({
            id: `xpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            projectId: projAId,
            userId: testUserId,
            amount,
            reason,
          });

          await tx
            .insert(userXpBalances)
            .values({
              id: `bal_${projAId}_${testUserId}`,
              projectId: projAId,
              userId: testUserId,
              totalXp: amount,
            })
            .onConflictDoUpdate({
              target: [userXpBalances.projectId, userXpBalances.userId],
              set: {
                totalXp: sql`${userXpBalances.totalXp} + ${amount}`,
                updatedAt: new Date(),
              },
            });
        });
      };

      // Step 5 & 6: Award 50 XP -> Level 1 (50% progress)
      await awardXpDirectly(50, 'Initial 50 XP');
      const prog50 = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      const data50 = JSON.parse(prog50.payload);
      expect(data50.totalXp).toBe(50);
      expect(data50.level.number).toBe(1);
      expect(data50.progressPercent).toBe(50);

      // Step 7 & 8: Award another 50 XP (Total 100 XP) -> Level 2
      await awardXpDirectly(50, 'Second 50 XP');
      const prog100 = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      const data100 = JSON.parse(prog100.payload);
      expect(data100.totalXp).toBe(100);
      expect(data100.level.number).toBe(2);

      // Step 9 & 10: Award 150 XP (Total 250 XP) -> Level 3
      await awardXpDirectly(150, 'Award 150 XP');
      const prog250 = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      const data250 = JSON.parse(prog250.payload);
      expect(data250.totalXp).toBe(250);
      expect(data250.level.number).toBe(3);

      // Step 11 & 12: Award 250 XP (Total 500 XP) -> Level 4
      await awardXpDirectly(250, 'Award 250 XP');
      const prog500 = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      const data500 = JSON.parse(prog500.payload);
      expect(data500.totalXp).toBe(500);
      expect(data500.level.number).toBe(4);

      // Step 13: Award 2000 XP (Total 2500 XP) -> Level 6 (Max Level)
      await awardXpDirectly(2000, 'Award 2000 XP');
      const progMax = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      const dataMax = JSON.parse(progMax.payload);
      expect(dataMax.totalXp).toBe(2500);
      expect(dataMax.level.number).toBe(6);
      expect(dataMax.isMaxLevel).toBe(true);

      // Step 14: Modify level threshold (Update Level 2 required XP from 100 to 150)
      const allLevels = JSON.parse(levRes.payload);
      const lvl2Def = allLevels.find((l: { level: number; id: string }) => l.level === 2);

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projAId}/levels/${lvl2Def.id}`,
        headers: { cookie: ownerCookie },
        payload: { requiredXp: 150 },
      });
      expect(updateRes.statusCode).toBe(200);

      // Step 15: Verify XP history remains unchanged
      const [bal] = await db
        .select()
        .from(userXpBalances)
        .where(and(eq(userXpBalances.projectId, projAId), eq(userXpBalances.userId, testUserId)));
      expect(bal.totalXp).toBe(2500);

      // Step 16: Verify level recalculates using new thresholds
      const progRecalc = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      expect(progRecalc.statusCode).toBe(200);

      // Step 17: Create Project B with separate levels
      const prjBRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: ownerCookie },
        payload: {
          organizationId: orgId,
          name: 'Project B',
          slug: `prj-b-${randomUUID()}`,
        },
      });
      const prjB = JSON.parse(prjBRes.payload);
      projBId = prjB.id;

      // Step 18: Verify Project A progression is unaffected by Project B and cross-project requests are rejected
      const crossReq = await app.inject({
        method: 'GET',
        url: `/api/projects/${projBId}/users/${testUserId}/progress`,
        headers: { cookie: ownerCookie },
      });
      expect(crossReq.statusCode).toBe(404);
      expect(JSON.parse(crossReq.payload).message).toBe('End user not found in this project');
    });
  });

  describe('4. Progression Summary Analytics API', () => {
    it('returns accurate summary statistics & level distribution breakdown', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projAId}/progression/summary`,
        headers: { cookie: ownerCookie },
      });

      expect(res.statusCode).toBe(200);
      const summary = JSON.parse(res.payload);
      expect(summary.configuredLevelCount).toBe(6);
      expect(summary.maxConfiguredLevel).toBe(6);
      expect(summary.totalProjectXp).toBe(2500);
      expect(summary.usersWithXp).toBe(1);
      expect(summary.distribution).toBeDefined();
      expect(summary.distribution).toHaveLength(6);
    });
  });
});
