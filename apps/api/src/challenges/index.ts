import { randomUUID } from 'crypto';
import { challenges, db, endUsers, userChallengeProgress } from '@gami/database';
import { validateChallengeInput } from '@gami/challenges';
import { and, eq, sql } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';

export async function challengeRoutes(fastify: FastifyInstance) {
  // 1. POST /api/projects/:projectId/challenges (Create challenge)
  fastify.post<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/challenges', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const roleAccess = await requireOrgRole(request, reply, access.project.organizationId, [
      'owner',
      'admin',
    ]);
    if (!roleAccess) return;

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
      type: 'counter',
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

    // Aggregate user progress stats
    const progressRows = await db
      .select()
      .from(userChallengeProgress)
      .where(eq(userChallengeProgress.projectId, projectId));

    const totalCompletedInstances = progressRows.filter((p) => p.completed).length;
    const uniqueUsersSet = new Set(progressRows.map((p) => p.userId));
    const uniqueParticipatingUsers = uniqueUsersSet.size;

    const completionRate =
      progressRows.length > 0
        ? Math.round((totalCompletedInstances / progressRows.length) * 100)
        : 0;

    // Top completed challenges
    const completionCounts: Record<string, number> = {};
    progressRows.forEach((p) => {
      if (p.completed) {
        completionCounts[p.challengeId] = (completionCounts[p.challengeId] || 0) + 1;
      }
    });

    const mostCompletedChallenges = allChallenges
      .map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        completedCount: completionCounts[c.id] || 0,
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

    const roleAccess = await requireOrgRole(request, reply, access.project.organizationId, [
      'owner',
      'admin',
    ]);
    if (!roleAccess) return;

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

    const roleAccess = await requireOrgRole(request, reply, access.project.organizationId, [
      'owner',
      'admin',
    ]);
    if (!roleAccess) return;

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

    const progressMap = new Map(progressList.map((p) => [p.challengeId, p]));

    const result = projectChallenges.map((ch) => {
      const prog = progressMap.get(ch.id);
      return {
        challengeId: ch.id,
        key: ch.key,
        name: ch.name,
        description: ch.description,
        iconUrl: ch.iconUrl,
        enabled: ch.enabled,
        trigger: ch.trigger,
        target: ch.target,
        progress: prog ? prog.progress : 0,
        completed: prog ? prog.completed : false,
        completedAt: prog ? prog.completedAt : null,
        percent: prog ? Math.min(100, Math.round((prog.progress / ch.target) * 100)) : 0,
      };
    });

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

    const [prog] = await db
      .select()
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectId),
          eq(userChallengeProgress.userId, targetUser.id),
          eq(userChallengeProgress.challengeId, ch.id)
        )
      );

    return reply.status(200).send({
      challengeId: ch.id,
      key: ch.key,
      name: ch.name,
      description: ch.description,
      target: ch.target,
      progress: prog ? prog.progress : 0,
      completed: prog ? prog.completed : false,
      completedAt: prog ? prog.completedAt : null,
      percent: prog ? Math.min(100, Math.round((prog.progress / ch.target) * 100)) : 0,
    });
  });
}
