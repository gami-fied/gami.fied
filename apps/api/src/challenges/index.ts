import { randomUUID } from 'crypto';
import { challenges, db, endUsers, userChallengeProgress } from '@gami/database';
import {
  periodEnd,
  periodKey,
  validateChallengeInput,
  type ChallengeRecurrence,
  type ChallengeStep,
} from '@gami/challenges';
import type { UserChallengeProgress } from '@gami/database';
import { and, eq, sql } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

type ChallengeRow = typeof challenges.$inferSelect;

/**
 * One challenge as a user sees it. A repeating challenge reads the row for the current period,
 * so yesterday's finished quest shows as not started today, and `completions` keeps the history.
 */
function describeProgress(challenge: ChallengeRow, rows: UserChallengeProgress[], now: Date) {
  const recurrence = challenge.recurrence as ChallengeRecurrence | null;
  const period = periodKey(recurrence, now);
  const current = rows.find((row) => row.challengeId === challenge.id && row.periodKey === period);
  const progress = current?.progress ?? 0;
  const steps = (challenge.steps as ChallengeStep[] | null) ?? null;

  return {
    challengeId: challenge.id,
    key: challenge.key,
    name: challenge.name,
    description: challenge.description,
    iconUrl: challenge.iconUrl,
    enabled: challenge.enabled,
    trigger: challenge.trigger,
    type: challenge.type,
    recurrence,
    target: challenge.target,
    progress,
    completed: current?.completed ?? false,
    completedAt: current?.completedAt ?? null,
    percent: Math.min(100, Math.round((progress / challenge.target) * 100)),
    periodEndsAt: periodEnd(recurrence, now),
    completions: rows.filter((row) => row.challengeId === challenge.id && row.completed).length,
    steps: steps?.map((step, index) => ({ name: step.name, event: step.event, done: index < progress })) ?? null,
  };
}

export async function challengeRoutes(fastify: FastifyInstance) {
  // 1. POST /api/projects/:projectId/challenges (Create challenge)
  fastify.post<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/challenges', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;


    const validation = validateChallengeInput(request.body);
    if (!validation.valid || !validation.sanitized) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid challenge definition',
        errors: validation.errors,
        statusCode: 400,
      });
    }

    const input = validation.sanitized;

    // Check unique key in project
    const [existing] = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.projectId, projectId), eq(challenges.key, input.key)));

    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `Challenge key '${input.key}' already exists in project`,
        statusCode: 409,
      });
    }

    const challengeId = `ch_${randomUUID()}`;
    const newChallenge = {
      id: challengeId,
      projectId,
      key: input.key,
      name: input.name,
      description: input.description || null,
      iconUrl: input.iconUrl || null,
      enabled: input.enabled !== undefined ? input.enabled : true,
      trigger: input.trigger,
      type: input.type ?? 'counter',
      filters: input.filters ?? null,
      steps: input.steps ?? null,
      recurrence: input.recurrence ?? null,
      target: input.target,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      rewards: input.rewards,
    };

    await db.insert(challenges).values(newChallenge);

    return reply.status(201).send(newChallenge);
  });

  // 2. GET /api/projects/:projectId/challenges (List challenges)
  fastify.get<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/challenges', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const list = await db
      .select()
      .from(challenges)
      .where(eq(challenges.projectId, projectId))
      .orderBy(challenges.createdAt);

    return reply.status(200).send(list);
  });

  // 3. GET /api/projects/:projectId/challenges/summary (Challenge statistics)
  fastify.get<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/challenges/summary', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const allChallenges = await db
      .select()
      .from(challenges)
      .where(eq(challenges.projectId, projectId));

    const totalChallenges = allChallenges.length;
    const enabledChallenges = allChallenges.filter((c) => c.enabled).length;

    const now = new Date();
    const activeChallenges = allChallenges.filter((c) => {
      if (!c.enabled) return false;
      if (c.startAt && now < new Date(c.startAt)) return false;
      if (c.endAt && now >= new Date(c.endAt)) return false;
      return true;
    }).length;

    // Progress totals and the most completed challenges, counted in the database so this stays
    // cheap however many users have progress.
    const [totals] = await db
      .select({
        started: sql<number>`COUNT(*)::int`,
        finished: sql<number>`COUNT(*) FILTER (WHERE ${userChallengeProgress.completed})::int`,
        users: sql<number>`COUNT(DISTINCT ${userChallengeProgress.userId})::int`,
      })
      .from(userChallengeProgress)
      .where(eq(userChallengeProgress.projectId, projectId));

    const totalCompletedInstances = totals?.finished ?? 0;
    const uniqueParticipatingUsers = totals?.users ?? 0;
    const startedCount = totals?.started ?? 0;

    const completionRate =
      startedCount > 0 ? Math.round((totalCompletedInstances / startedCount) * 100) : 0;

    const completedRows = await db
      .select({
        challengeId: userChallengeProgress.challengeId,
        completed: sql<number>`COUNT(*)::int`,
      })
      .from(userChallengeProgress)
      .where(
        and(eq(userChallengeProgress.projectId, projectId), eq(userChallengeProgress.completed, true))
      )
      .groupBy(userChallengeProgress.challengeId);
    const completionCounts = new Map(completedRows.map((row) => [row.challengeId, row.completed]));

    const mostCompletedChallenges = allChallenges
      .map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        completedCount: completionCounts.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.completedCount - a.completedCount)
      .slice(0, 5);

    return reply.status(200).send({
      totalChallenges,
      enabledChallenges,
      activeChallenges,
      totalCompletedInstances,
      uniqueParticipatingUsers,
      completionRate,
      mostCompletedChallenges,
    });
  });

  // 4. GET /api/projects/:projectId/challenges/:challengeId (Get challenge)
  fastify.get<{
    Params: { projectId: string; challengeId: string };
  }>('/api/projects/:projectId/challenges/:challengeId', async (request, reply) => {
    const { projectId, challengeId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const [ch] = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.projectId, projectId)));

    if (!ch) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Challenge '${challengeId}' not found`,
        statusCode: 404,
      });
    }

    return reply.status(200).send(ch);
  });

  // 5. PATCH /api/projects/:projectId/challenges/:challengeId (Update challenge)
  fastify.patch<{
    Params: { projectId: string; challengeId: string };
  }>('/api/projects/:projectId/challenges/:challengeId', async (request, reply) => {
    const { projectId, challengeId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;


    const [existing] = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.projectId, projectId)));

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Challenge '${challengeId}' not found`,
        statusCode: 404,
      });
    }

    const body = (request.body || {}) as Record<string, unknown>;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === 'string') updateData.name = body.name.trim();
    if (typeof body.description === 'string') updateData.description = body.description.trim();
    if (typeof body.iconUrl === 'string') updateData.iconUrl = body.iconUrl.trim();
    if (typeof body.enabled === 'boolean') updateData.enabled = body.enabled;
    if (typeof body.trigger === 'string') updateData.trigger = body.trigger.trim();
    if (typeof body.target === 'number' && body.target > 0) updateData.target = body.target;

    // The shape of a challenge (steps, conditions, how often it repeats) is checked as a whole.
    const shapeChanged = ['type', 'steps', 'filters', 'recurrence'].some((key) => body[key] !== undefined);
    if (shapeChanged || updateData.trigger !== undefined || updateData.target !== undefined) {
      const merged = validateChallengeInput({
        key: existing.key,
        name: existing.name,
        trigger: existing.trigger,
        type: existing.type,
        target: existing.target,
        filters: existing.filters,
        steps: existing.steps,
        recurrence: existing.recurrence,
        rewards: existing.rewards,
        ...body,
      });
      if (!merged.valid || !merged.sanitized) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid challenge definition',
          errors: merged.errors,
          statusCode: 400,
        });
      }

      const structural = ['type', 'steps', 'recurrence'].some((key) => body[key] !== undefined);
      if (structural) {
        const [started] = await db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(userChallengeProgress)
          .where(eq(userChallengeProgress.challengeId, challengeId));
        const stepsChanged = JSON.stringify(merged.sanitized.steps) !== JSON.stringify(existing.steps);
        if ((started?.total ?? 0) > 0 && (stepsChanged || merged.sanitized.type !== existing.type)) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Users have already made progress, so the steps cannot change. Create a new challenge instead.',
            statusCode: 409,
          });
        }
      }

      updateData.type = merged.sanitized.type;
      updateData.filters = merged.sanitized.filters ?? null;
      updateData.steps = merged.sanitized.steps ?? null;
      updateData.recurrence = merged.sanitized.recurrence ?? null;
      updateData.trigger = merged.sanitized.trigger;
      updateData.target = merged.sanitized.target;
    }
    if (body.startAt !== undefined)
      updateData.startAt = body.startAt ? new Date(body.startAt as string) : null;
    if (body.endAt !== undefined)
      updateData.endAt = body.endAt ? new Date(body.endAt as string) : null;
    if (Array.isArray(body.rewards)) updateData.rewards = body.rewards;

    const [updated] = await db
      .update(challenges)
      .set(updateData)
      .where(eq(challenges.id, challengeId))
      .returning();

    return reply.status(200).send(updated);
  });

  // 6. DELETE /api/projects/:projectId/challenges/:challengeId (Soft-disable)
  fastify.delete<{
    Params: { projectId: string; challengeId: string };
  }>('/api/projects/:projectId/challenges/:challengeId', async (request, reply) => {
    const { projectId, challengeId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;


    const [existing] = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.projectId, projectId)));

    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Challenge '${challengeId}' not found`,
        statusCode: 404,
      });
    }

    await db
      .update(challenges)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(challenges.id, challengeId));

    return reply.status(200).send({
      message: `Challenge '${challengeId}' has been soft-disabled`,
      statusCode: 200,
    });
  });

  // 7. GET /api/projects/:projectId/users/:userId/challenges (User progress list)
  fastify.get<{
    Params: { projectId: string; userId: string };
  }>('/api/projects/:projectId/users/:userId/challenges', async (request, reply) => {
    const { projectId, userId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    // Resolve end-user by id or external_id
    const [targetUser] = await db
      .select()
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, projectId),
          sql`(${endUsers.id} = ${userId} OR ${endUsers.externalId} = ${userId})`
        )
      );

    if (!targetUser) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `User '${userId}' not found in project`,
        statusCode: 404,
      });
    }

    const projectChallenges = await db
      .select()
      .from(challenges)
      .where(eq(challenges.projectId, projectId));

    const progressList = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectId),
          eq(userChallengeProgress.userId, targetUser.id)
        )
      );

    const now = new Date();
    const result = projectChallenges.map((ch) => describeProgress(ch, progressList, now));

    return reply.status(200).send({
      userId: targetUser.id,
      externalId: targetUser.externalId,
      name: targetUser.name,
      challenges: result,
    });
  });

  // 8. GET /api/projects/:projectId/users/:userId/challenges/:challengeId (Specific user progress)
  fastify.get<{
    Params: { projectId: string; userId: string; challengeId: string };
  }>('/api/projects/:projectId/users/:userId/challenges/:challengeId', async (request, reply) => {
    const { projectId, userId, challengeId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const [targetUser] = await db
      .select()
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, projectId),
          sql`(${endUsers.id} = ${userId} OR ${endUsers.externalId} = ${userId})`
        )
      );

    if (!targetUser) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `User '${userId}' not found in project`,
        statusCode: 404,
      });
    }

    const [ch] = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, challengeId), eq(challenges.projectId, projectId)));

    if (!ch) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Challenge '${challengeId}' not found`,
        statusCode: 404,
      });
    }

    const rows = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectId),
          eq(userChallengeProgress.userId, targetUser.id),
          eq(userChallengeProgress.challengeId, ch.id)
        )
      );

    return reply.status(200).send(describeProgress(ch, rows, new Date()));
  });
}
