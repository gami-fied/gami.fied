import crypto from 'crypto';
import {
  db,
  endUsers,
  isUniqueViolation,
  streakDefinitions,
  streakHistory,
  userStreaks,
} from '@gami/database';
import { isValidTimeZone, streakStatus, type StreakCadence } from '@gami/progression';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const timeZone = z.string().refine(isValidTimeZone, { message: 'Must be an IANA time zone such as Europe/London' });

const createStreakSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, { message: 'Key must contain only letters, numbers, underscores or dashes' }),
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  triggerEvent: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => value !== 'streak_updated', {
      message: 'streak_updated is emitted by streaks themselves, so it cannot also start one',
    }),
  cadence: z.enum(['daily', 'weekly']).default('daily'),
  timeZone: timeZone.default('UTC'),
  freezeEvery: z.number().int().min(0).max(365).default(0),
  maxFreezes: z.number().int().min(0).max(30).default(0),
  enabled: z.boolean().default(true),
});

// The key and the trigger stay fixed, because changing them would silently rewrite what users earned.
const updateStreakSchema = createStreakSchema
  .omit({ key: true, triggerEvent: true, cadence: true })
  .partial();

export async function streakRoutes(fastify: FastifyInstance) {
  async function resolveUser(projectId: string, userId: string) {
    const [user] = await db
      .select({ id: endUsers.id, metadata: endUsers.metadata })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, projectId),
          sql`(${endUsers.id} = ${userId} OR ${endUsers.externalId} = ${userId})`
        )
      );
    return user ?? null;
  }

  // 1. Create a streak (admin)
  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/streaks', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const parsed = createStreakSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Bad Request', message: 'Invalid streak payload', details: parsed.error.format() });
    }
    const data = parsed.data;

    try {
      const [created] = await db
        .insert(streakDefinitions)
        .values({
          id: `sdf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          projectId,
          ...data,
          description: data.description ?? null,
        })
        .returning();
      return reply.status(201).send(created);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: `Streak key "${data.key}" already exists in project` });
      }
      throw err;
    }
  });

  // 2. List streaks
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/streaks', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const data = await db
      .select()
      .from(streakDefinitions)
      .where(eq(streakDefinitions.projectId, projectId))
      .orderBy(desc(streakDefinitions.createdAt), desc(streakDefinitions.id));
    return reply.send({ data });
  });

  // 2b. Who has the longest streak running right now
  fastify.get<{ Params: { projectId: string; streakId: string } }>(
    '/api/projects/:projectId/streaks/:streakId/leaders',
    async (request, reply) => {
      const { projectId, streakId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [definition] = await db
        .select()
        .from(streakDefinitions)
        .where(and(eq(streakDefinitions.id, streakId), eq(streakDefinitions.projectId, projectId)));
      if (!definition) return reply.status(404).send({ error: 'Not Found', message: 'Streak not found' });

      const rows = await db
        .select({
          userId: userStreaks.userId,
          externalId: endUsers.externalId,
          name: endUsers.name,
          current: userStreaks.current,
          longest: userStreaks.longest,
          lastPeriod: userStreaks.lastPeriod,
          lastActivityAt: userStreaks.lastActivityAt,
          freezes: userStreaks.freezes,
          timeZone: userStreaks.timeZone,

        })
        .from(userStreaks)
        .innerJoin(endUsers, eq(endUsers.id, userStreaks.userId))
        .where(
          and(
            eq(userStreaks.projectId, projectId),
            eq(userStreaks.definitionId, streakId),
            eq(endUsers.active, true),
            gt(userStreaks.current, 0)
          )
        )
        .orderBy(desc(userStreaks.current), desc(userStreaks.longest), userStreaks.userId)
        .limit(50);

      // A streak that has lapsed is stored until the user's next action, so read each as of now.
      const now = new Date();
      const settings = {
        cadence: definition.cadence as StreakCadence,
        timeZone: definition.timeZone,
        freezeEvery: definition.freezeEvery,
        maxFreezes: definition.maxFreezes,
      };
      const data = rows
        .map((row) => {
          const status = streakStatus(
            { current: row.current, longest: row.longest, lastPeriod: row.lastPeriod, freezes: row.freezes },
            now,
            settings,
            row.timeZone ?? definition.timeZone
          );
          return {
            userId: row.userId,
            externalId: row.externalId,
            name: row.name,
            current: status.current,
            longest: row.longest,
            atRisk: status.atRisk,
            lastActivityAt: row.lastActivityAt,
          };
        })
        .filter((row) => row.current > 0)
        .slice(0, 10);

      return reply.send({ data });
    }
  );

  // 3. Update a streak (admin)
  fastify.patch<{ Params: { projectId: string; streakId: string } }>(
    '/api/projects/:projectId/streaks/:streakId',
    async (request, reply) => {
      const { projectId, streakId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parsed = updateStreakSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: 'Invalid streak payload', details: parsed.error.format() });
      }

      const [updated] = await db
        .update(streakDefinitions)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(streakDefinitions.id, streakId), eq(streakDefinitions.projectId, projectId)))
        .returning();
      if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Streak not found' });
      return reply.send(updated);
    }
  );

  // 4. Delete a streak and every user's progress on it (admin)
  fastify.delete<{ Params: { projectId: string; streakId: string } }>(
    '/api/projects/:projectId/streaks/:streakId',
    async (request, reply) => {
      const { projectId, streakId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [deleted] = await db
        .delete(streakDefinitions)
        .where(and(eq(streakDefinitions.id, streakId), eq(streakDefinitions.projectId, projectId)))
        .returning({ id: streakDefinitions.id });
      if (!deleted) return reply.status(404).send({ error: 'Not Found', message: 'Streak not found' });
      return reply.status(204).send();
    }
  );

  // 5. A user's streaks, read as of now so an ended streak shows as ended before their next action
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/streaks',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const user = await resolveUser(projectId, userId);
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });

      const definitions = await db
        .select()
        .from(streakDefinitions)
        .where(and(eq(streakDefinitions.projectId, projectId), eq(streakDefinitions.enabled, true)))
        .orderBy(streakDefinitions.createdAt, streakDefinitions.id);
      const states = await db
        .select()
        .from(userStreaks)
        .where(and(eq(userStreaks.projectId, projectId), eq(userStreaks.userId, user.id)));
      const byDefinition = new Map(states.map((state) => [state.definitionId, state]));
      const now = new Date();

      const data = definitions.map((definition) => {
        const row = byDefinition.get(definition.id);
        const settings = {
          cadence: definition.cadence as StreakCadence,
          timeZone: definition.timeZone,
          freezeEvery: definition.freezeEvery,
          maxFreezes: definition.maxFreezes,
        };
        const zone = row?.timeZone ?? definition.timeZone;
        const status = row
          ? streakStatus(
              { current: row.current, longest: row.longest, lastPeriod: row.lastPeriod, freezes: row.freezes },
              now,
              settings,
              zone
            )
          : { alive: false, atRisk: false, current: 0 };

        return {
          streakId: definition.id,
          key: definition.key,
          name: definition.name,
          cadence: definition.cadence,
          current: status.current,
          longest: row?.longest ?? 0,
          freezes: row?.freezes ?? 0,
          atRisk: status.atRisk,
          timeZone: zone,
          lastActivityAt: row?.lastActivityAt ?? null,
        };
      });

      return reply.send({ data });
    }
  );

  // 6. A user's streak history, newest first
  fastify.get<{ Params: { projectId: string; userId: string }; Querystring: { limit?: string; streak?: string } }>(
    '/api/projects/:projectId/users/:userId/streaks/history',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const user = await resolveUser(projectId, userId);
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });

      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      const data = await db
        .select({
          id: streakHistory.id,
          streakKey: streakDefinitions.key,
          change: streakHistory.change,
          current: streakHistory.current,
          freezesUsed: streakHistory.freezesUsed,
          freezesEarned: streakHistory.freezesEarned,
          brokenStreak: streakHistory.brokenStreak,
          eventId: streakHistory.eventId,
          createdAt: streakHistory.createdAt,
        })
        .from(streakHistory)
        .innerJoin(streakDefinitions, eq(streakHistory.definitionId, streakDefinitions.id))
        .where(
          and(
            eq(streakHistory.projectId, projectId),
            eq(streakHistory.userId, user.id),
            request.query.streak ? eq(streakDefinitions.key, request.query.streak) : undefined
          )
        )
        .orderBy(desc(streakHistory.createdAt), desc(streakHistory.id))
        .limit(limit);

      return reply.send({ data });
    }
  );
}
