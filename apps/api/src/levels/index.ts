import { db, endUsers, levels, userXpBalances } from '@gami/database';
import { calculateLevel, validateLevelDefinitions } from '@gami/progression';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';

export async function levelRoutes(fastify: FastifyInstance) {
  // Create Level (Owner/Admin)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/levels',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
        'owner',
        'admin',
      ]);
      if (!orgAuth) return;

      const { level, name, description, iconUrl, requiredXp, enabled } =
        (request.body as {
          level?: number;
          name?: string;
          description?: string;
          iconUrl?: string;
          requiredXp?: number;
          enabled?: boolean;
        }) || {};

      if (level === undefined || !name || requiredXp === undefined) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'level, name, and requiredXp are required fields',
        });
      }

      // Fetch existing levels for validation
      const existingLevels = await db.select().from(levels).where(eq(levels.projectId, projectId));

      const proposedLevels = [
        ...existingLevels.map((l) => ({
          level: l.level,
          name: l.name,
          requiredXp: l.requiredXp,
          enabled: l.enabled,
        })),
        {
          level,
          name,
          requiredXp,
          enabled: enabled ?? true,
        },
      ];

      const validation = validateLevelDefinitions(proposedLevels);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid level progression configuration',
          errors: validation.errors,
        });
      }

      const levelId = `lvl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      try {
        const [createdLevel] = await db
          .insert(levels)
          .values({
            id: levelId,
            projectId,
            level,
            name,
            description,
            iconUrl,
            enabled: enabled ?? true,
            requiredXp,
          })
          .returning();

        return reply.status(201).send(createdLevel);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === '23505') {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'A level with this level number or required XP threshold already exists',
          });
        }
        throw err;
      }
    }
  );

  // List Levels (Member+)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/levels',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const projectLevels = await db
        .select()
        .from(levels)
        .where(eq(levels.projectId, projectId))
        .orderBy(asc(levels.level));

      return reply.send(projectLevels);
    }
  );

  // Get single Level (Member+)
  fastify.get<{ Params: { projectId: string; levelId: string } }>(
    '/api/projects/:projectId/levels/:levelId',
    async (request, reply) => {
      const { projectId, levelId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [targetLevel] = await db
        .select()
        .from(levels)
        .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)));

      if (!targetLevel) {
        return reply.status(404).send({ error: 'Not Found', message: 'Level not found' });
      }

      return reply.send(targetLevel);
    }
  );

  // Update Level (Owner/Admin)
  fastify.patch<{ Params: { projectId: string; levelId: string } }>(
    '/api/projects/:projectId/levels/:levelId',
    async (request, reply) => {
      const { projectId, levelId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
        'owner',
        'admin',
      ]);
      if (!orgAuth) return;

      const [existingLevel] = await db
        .select()
        .from(levels)
        .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)));

      if (!existingLevel) {
        return reply.status(404).send({ error: 'Not Found', message: 'Level not found' });
      }

      const body =
        (request.body as {
          level?: number;
          name?: string;
          description?: string;
          iconUrl?: string;
          requiredXp?: number;
          enabled?: boolean;
        }) || {};

      const existingLevels = await db.select().from(levels).where(eq(levels.projectId, projectId));

      const proposedLevels = existingLevels.map((l) => {
        if (l.id === levelId) {
          return {
            level: body.level ?? l.level,
            name: body.name ?? l.name,
            requiredXp: body.requiredXp ?? l.requiredXp,
            enabled: body.enabled ?? l.enabled,
          };
        }
        return {
          level: l.level,
          name: l.name,
          requiredXp: l.requiredXp,
          enabled: l.enabled,
        };
      });

      const validation = validateLevelDefinitions(proposedLevels);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid level progression configuration',
          errors: validation.errors,
        });
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (body.level !== undefined) updateData['level'] = body.level;
      if (body.name !== undefined) updateData['name'] = body.name;
      if (body.description !== undefined) updateData['description'] = body.description;
      if (body.iconUrl !== undefined) updateData['iconUrl'] = body.iconUrl;
      if (body.requiredXp !== undefined) updateData['requiredXp'] = body.requiredXp;
      if (body.enabled !== undefined) updateData['enabled'] = body.enabled;

      try {
        const [updatedLevel] = await db
          .update(levels)
          .set(updateData)
          .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
          .returning();

        return reply.send(updatedLevel);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === '23505') {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'A level with this level number or required XP threshold already exists',
          });
        }
        throw err;
      }
    }
  );

  // Soft-disable Level (Owner/Admin)
  fastify.delete<{ Params: { projectId: string; levelId: string } }>(
    '/api/projects/:projectId/levels/:levelId',
    async (request, reply) => {
      const { projectId, levelId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
        'owner',
        'admin',
      ]);
      if (!orgAuth) return;

      const [existingLevel] = await db
        .select()
        .from(levels)
        .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)));

      if (!existingLevel) {
        return reply.status(404).send({ error: 'Not Found', message: 'Level not found' });
      }

      const existingLevels = await db.select().from(levels).where(eq(levels.projectId, projectId));

      const proposedLevels = existingLevels.map((l) => ({
        level: l.level,
        name: l.name,
        requiredXp: l.requiredXp,
        enabled: l.id === levelId ? false : l.enabled,
      }));

      const validation = validateLevelDefinitions(proposedLevels);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Disabling this level creates an invalid progression sequence',
          errors: validation.errors,
        });
      }

      const [disabledLevel] = await db
        .update(levels)
        .set({ enabled: false, updatedAt: new Date() })
        .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
        .returning();

      return reply.send(disabledLevel);
    }
  );

  // Get User Progress (Member+)
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/progress',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      // Verify user belongs to project
      const [endUser] = await db
        .select()
        .from(endUsers)
        .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)));

      if (!endUser) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'End user not found in this project' });
      }

      // Load active level definitions
      const activeLevels = await db
        .select()
        .from(levels)
        .where(and(eq(levels.projectId, projectId), eq(levels.enabled, true)))
        .orderBy(asc(levels.level));

      if (activeLevels.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'No active level definitions configured for this project',
        });
      }

      // Fetch user XP balance
      const [xpRecord] = await db
        .select()
        .from(userXpBalances)
        .where(and(eq(userXpBalances.projectId, projectId), eq(userXpBalances.userId, userId)));

      const totalXp = xpRecord ? xpRecord.totalXp : 0;

      const calcResult = calculateLevel(totalXp, activeLevels);

      const nextLevelObj =
        calcResult.isMaxLevel || calcResult.nextLevelXp === null
          ? null
          : {
              number: calcResult.level + 1,
              name:
                activeLevels.find((l) => l.level === calcResult.level + 1)?.name || 'Next Level',
              requiredXp: calcResult.nextLevelXp,
            };

      return reply.send({
        projectId,
        userId,
        totalXp: calcResult.currentXp,
        level: {
          number: calcResult.level,
          name: calcResult.name,
          requiredXp: calcResult.levelRequiredXp,
        },
        nextLevel: nextLevelObj,
        xpIntoLevel: calcResult.xpIntoLevel,
        xpToNextLevel: calcResult.xpToNextLevel,
        progressPercent: calcResult.progressPercent,
        isMaxLevel: calcResult.isMaxLevel,
      });
    }
  );

  // Get Progression Summary Analytics (Member+)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/progression/summary',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const activeLevels = await db
        .select()
        .from(levels)
        .where(and(eq(levels.projectId, projectId), eq(levels.enabled, true)))
        .orderBy(asc(levels.level));

      const configuredLevelCount = activeLevels.length;
      const lastLevel = activeLevels[activeLevels.length - 1];
      const maxConfiguredLevel = lastLevel ? lastLevel.level : 0;

      // Sum of total project XP
      const [sumRes] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${userXpBalances.totalXp}), 0)`,
          usersWithXp: sql<number>`COUNT(CASE WHEN ${userXpBalances.totalXp} > 0 THEN 1 END)`,
        })
        .from(userXpBalances)
        .where(eq(userXpBalances.projectId, projectId));

      const totalProjectXp = Number(sumRes?.total || 0);
      const usersWithXp = Number(sumRes?.usersWithXp || 0);

      // Fetch all end-users in project and their balances
      const allProjectUsers = await db
        .select({
          userId: endUsers.id,
          totalXp: userXpBalances.totalXp,
        })
        .from(endUsers)
        .leftJoin(
          userXpBalances,
          and(eq(userXpBalances.userId, endUsers.id), eq(userXpBalances.projectId, projectId))
        )
        .where(eq(endUsers.projectId, projectId));

      // Calculate level distribution for all end-users
      const distributionMap = new Map<number, number>();
      for (const lvl of activeLevels) {
        distributionMap.set(lvl.level, 0);
      }

      let usersAtMaxLevel = 0;

      for (const u of allProjectUsers) {
        const userXp = u.totalXp ? u.totalXp : 0;
        if (activeLevels.length > 0) {
          const calc = calculateLevel(userXp, activeLevels);
          const currentCount = distributionMap.get(calc.level) || 0;
          distributionMap.set(calc.level, currentCount + 1);
          if (calc.isMaxLevel) {
            usersAtMaxLevel++;
          }
        }
      }

      const distribution = activeLevels.map((lvl) => ({
        level: lvl.level,
        name: lvl.name,
        userCount: distributionMap.get(lvl.level) || 0,
      }));

      return reply.send({
        configuredLevelCount,
        maxConfiguredLevel,
        totalProjectXp,
        usersWithXp,
        usersAtMaxLevel,
        distribution,
      });
    }
  );
}
