import crypto from 'crypto';
import { achievements, db, userAchievements } from '@gami/database';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const createAchievementSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: 'Key must contain only alphanumeric characters, underscores, or dashes',
    }),
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().max(512).optional().or(z.literal('')),
  enabled: z.boolean().optional().default(true),
});

const updateAchievementSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().max(512).optional().or(z.literal('')),
  enabled: z.boolean().optional(),
});

export async function achievementRoutes(fastify: FastifyInstance) {
  // 1. Create Achievement Definition (Owner / Admin Only)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/achievements',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = createAchievementSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid achievement payload',
          details: parseResult.error.format(),
        });
      }

      const { key, name, description, iconUrl, enabled } = parseResult.data;
      const achievementId = `ach_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      try {
        const [newAchievement] = await db
          .insert(achievements)
          .values({
            id: achievementId,
            projectId,
            key,
            name,
            description: description || null,
            iconUrl: iconUrl || null,
            enabled: enabled ?? true,
          })
          .returning();

        return reply.status(201).send(newAchievement);
      } catch (err: unknown) {
        const error = err as { code?: string; cause?: { code?: string } };
        const code = error.code || error.cause?.code;
        if (code === '23505') {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Achievement key "${key}" already exists in project`,
          });
        }
        throw err;
      }
    }
  );

  // 2. List Achievements in Project (Member+)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/achievements',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const projectAchievements = await db
        .select()
        .from(achievements)
        .where(eq(achievements.projectId, projectId))
        .orderBy(desc(achievements.createdAt), desc(achievements.id));

      return reply.send({ data: projectAchievements });
    }
  );

  // 3. Get Single Achievement Definition (Member+)
  fastify.get<{ Params: { projectId: string; achievementId: string } }>(
    '/api/projects/:projectId/achievements/:achievementId',
    async (request, reply) => {
      const { projectId, achievementId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [achievement] = await db
        .select()
        .from(achievements)
        .where(and(eq(achievements.id, achievementId), eq(achievements.projectId, projectId)));

      if (!achievement) {
        return reply.status(404).send({ error: 'Not Found', message: 'Achievement not found' });
      }

      return reply.send(achievement);
    }
  );

  // 4. Update Achievement Definition (Owner / Admin Only)
  fastify.patch<{ Params: { projectId: string; achievementId: string } }>(
    '/api/projects/:projectId/achievements/:achievementId',
    async (request, reply) => {
      const { projectId, achievementId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = updateAchievementSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid update payload',
          details: parseResult.error.format(),
        });
      }

      const [existing] = await db
        .select()
        .from(achievements)
        .where(and(eq(achievements.id, achievementId), eq(achievements.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Achievement not found' });
      }

      const [updated] = await db
        .update(achievements)
        .set({
          ...parseResult.data,
          updatedAt: new Date(),
        })
        .where(eq(achievements.id, achievementId))
        .returning();

      return reply.send(updated);
    }
  );

  // 5. Soft Disable/Delete Achievement (Owner / Admin Only)
  fastify.delete<{ Params: { projectId: string; achievementId: string } }>(
    '/api/projects/:projectId/achievements/:achievementId',
    async (request, reply) => {
      const { projectId, achievementId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [existing] = await db
        .select()
        .from(achievements)
        .where(and(eq(achievements.id, achievementId), eq(achievements.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Achievement not found' });
      }

      // Soft disable achievement to preserve historical awards
      const [disabled] = await db
        .update(achievements)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(achievements.id, achievementId))
        .returning();

      return reply.send({
        message: 'Achievement soft disabled successfully',
        achievement: disabled,
      });
    }
  );

  // 6. Get User Achievements (Member+)
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/achievements',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const userAwarded = await db
        .select({
          id: userAchievements.id,
          projectId: userAchievements.projectId,
          userId: userAchievements.userId,
          achievementId: userAchievements.achievementId,
          eventId: userAchievements.eventId,
          ruleExecutionId: userAchievements.ruleExecutionId,
          metadata: userAchievements.metadata,
          awardedAt: userAchievements.awardedAt,
          achievementKey: achievements.key,
          achievementName: achievements.name,
          achievementDescription: achievements.description,
          iconUrl: achievements.iconUrl,
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(and(eq(userAchievements.projectId, projectId), eq(userAchievements.userId, userId)))
        .orderBy(desc(userAchievements.awardedAt));

      return reply.send({ data: userAwarded });
    }
  );

  // 7. Get Specific User Achievement Award (Member+)
  fastify.get<{ Params: { projectId: string; userId: string; achievementId: string } }>(
    '/api/projects/:projectId/users/:userId/achievements/:achievementId',
    async (request, reply) => {
      const { projectId, userId, achievementId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [award] = await db
        .select({
          id: userAchievements.id,
          projectId: userAchievements.projectId,
          userId: userAchievements.userId,
          achievementId: userAchievements.achievementId,
          eventId: userAchievements.eventId,
          ruleExecutionId: userAchievements.ruleExecutionId,
          metadata: userAchievements.metadata,
          awardedAt: userAchievements.awardedAt,
          achievementKey: achievements.key,
          achievementName: achievements.name,
          achievementDescription: achievements.description,
          iconUrl: achievements.iconUrl,
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(
          and(
            eq(userAchievements.projectId, projectId),
            eq(userAchievements.userId, userId),
            eq(userAchievements.achievementId, achievementId)
          )
        );

      if (!award) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'User achievement award not found' });
      }

      return reply.send(award);
    }
  );

  // 8. Aggregate Project Achievement Summary (Member+)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/achievements/summary',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [totalCount] = await db
        .select({ total: count() })
        .from(achievements)
        .where(eq(achievements.projectId, projectId));

      const [enabledCount] = await db
        .select({ total: count() })
        .from(achievements)
        .where(and(eq(achievements.projectId, projectId), eq(achievements.enabled, true)));

      const [awardsCount] = await db
        .select({ total: count() })
        .from(userAchievements)
        .where(eq(userAchievements.projectId, projectId));

      const [uniqueUsers] = await db
        .select({
          total: sql<number>`COUNT(DISTINCT ${userAchievements.userId})`,
        })
        .from(userAchievements)
        .where(eq(userAchievements.projectId, projectId));

      const mostAwardedAchievements = await db
        .select({
          achievementId: userAchievements.achievementId,
          key: achievements.key,
          name: achievements.name,
          awardCount: count(),
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(eq(userAchievements.projectId, projectId))
        .groupBy(userAchievements.achievementId, achievements.key, achievements.name)
        .orderBy(desc(count()))
        .limit(5);

      return reply.send({
        projectId,
        totalAchievements: totalCount?.total || 0,
        enabledAchievements: enabledCount?.total || 0,
        totalAwards: awardsCount?.total || 0,
        uniqueUsersWithAchievements: Number(uniqueUsers?.total || 0),
        mostAwardedAchievements,
      });
    }
  );
}
