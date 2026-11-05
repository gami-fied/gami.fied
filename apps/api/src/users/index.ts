import crypto from 'crypto';
import {
  achievements,
  db,
  endUsers,
  events,
  ruleExecutions,
  rules,
  userAchievements,
  webhookOutbox,
  xpLedger,
} from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';

const createUserSchema = z.object({
  externalId: z.string().min(1).max(128),
  name: z.string().max(128).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  avatarUrl: z.string().url().max(512).optional().nullable().or(z.literal('')),
  metadata: z.record(z.unknown()).optional().default({}),
});

const updateUserSchema = z.object({
  name: z.string().max(128).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  avatarUrl: z.string().url().max(512).optional().nullable().or(z.literal('')),
  metadata: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
});

export async function userRoutes(fastify: FastifyInstance) {
  // 1. GET /api/projects/:projectId/users (List project users with pagination & search)
  fastify.get<{
    Params: { projectId: string };
    Querystring: { page?: string; limit?: string; search?: string };
  }>('/api/projects/:projectId/users', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
    const offset = (page - 1) * limit;
    const search = request.query.search?.trim();

    const searchCondition = search
      ? or(ilike(endUsers.externalId, `%${search}%`), ilike(endUsers.name, `%${search}%`))
      : undefined;

    const whereClause = searchCondition
      ? and(eq(endUsers.projectId, projectId), searchCondition)
      : eq(endUsers.projectId, projectId);

    const [countResult] = await db.select({ total: count() }).from(endUsers).where(whereClause);

    const total = countResult?.total || 0;

    const users = await db
      .select()
      .from(endUsers)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(endUsers.createdAt), desc(endUsers.id));

    return reply.status(200).send({
      page,
      limit,
      total,
      users,
    });
  });

  // 2. GET /api/projects/:projectId/users/by-external-id/:externalId (Get user by external ID)
  // Register specific static subpath BEFORE generic :userId parameter to avoid route collisions
  fastify.get<{
    Params: { projectId: string; externalId: string };
  }>('/api/projects/:projectId/users/by-external-id/:externalId', async (request, reply) => {
    const { projectId, externalId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const decodedExternalId = decodeURIComponent(externalId);

    const [user] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, decodedExternalId)));

    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.status(200).send(user);
  });

  // 3. GET /api/projects/:projectId/users/:userId (Get user profile by internal Gami ID)
  fastify.get<{
    Params: { projectId: string; userId: string };
  }>('/api/projects/:projectId/users/:userId', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const [user] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)));

    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.status(200).send(user);
  });

  // 4. POST /api/projects/:projectId/users (Create user manually - Owner/Admin only)
  fastify.post<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/users', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const parseResult = createUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid user payload',
        details: parseResult.error.format(),
      });
    }

    const { externalId, name, email, avatarUrl, metadata } = parseResult.data;

    // Check unique externalId constraint
    const [existing] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, externalId)));

    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `User with externalId "${externalId}" already exists in project`,
      });
    }

    const newUserId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const [newUser] = await db
      .insert(endUsers)
      .values({
        id: newUserId,
        projectId,
        externalId,
        name: name || null,
        email: email || null,
        avatarUrl: avatarUrl || null,
        metadata: metadata || {},
        active: true,
      })
      .returning();

    if (!newUser) {
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to create user' });
    }

    await createWebhookDelivery(db, {
      projectId,
      eventId: newUser.id,
      eventType: 'user.created',
      userId: newUser.id,
      data: {
        externalId: newUser.externalId,
        name: newUser.name,
        email: newUser.email,
        avatarUrl: newUser.avatarUrl,
        metadata: newUser.metadata,
      },
    });

    return reply.status(201).send(newUser);
  });

  // 5. PATCH /api/projects/:projectId/users/:userId (Update profile & reactivation - Owner/Admin only)
  fastify.patch<{
    Params: { projectId: string; userId: string };
  }>('/api/projects/:projectId/users/:userId', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const [targetUser] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)));

    if (!targetUser) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    const parseResult = updateUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid update payload',
        details: parseResult.error.format(),
      });
    }

    const { name, email, avatarUrl, metadata, active } = parseResult.data;

    const updateData: Partial<typeof endUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name || null;
    if (email !== undefined) updateData.email = email || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl || null;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (active !== undefined) updateData.active = active;

    const [updatedUser] = await db
      .update(endUsers)
      .set(updateData)
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)))
      .returning();

    if (targetUser.active && active === false) {
      await createWebhookDelivery(db, {
        projectId,
        eventId: `deact_${userId}_${Date.now()}`,
        eventType: 'user.deactivated',
        userId,
        data: { externalId: targetUser.externalId, deactivatedAt: new Date().toISOString() },
      });
    }

    return reply.status(200).send(updatedUser);
  });

  // One view of what happened to a user: events, rule runs, XP and badges, newest first.
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/timeline',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const limit = 50;
      const [userEvents, ledger, badges, runs] = await Promise.all([
        db
          .select()
          .from(events)
          .where(and(eq(events.projectId, projectId), eq(events.userId, userId)))
          .orderBy(desc(events.occurredAt))
          .limit(limit),
        db
          .select()
          .from(xpLedger)
          .where(and(eq(xpLedger.projectId, projectId), eq(xpLedger.userId, userId)))
          .orderBy(desc(xpLedger.createdAt))
          .limit(limit),
        db
          .select({
            id: userAchievements.id,
            name: achievements.name,
            awardedAt: userAchievements.awardedAt,
          })
          .from(userAchievements)
          .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
          .where(and(eq(userAchievements.projectId, projectId), eq(userAchievements.userId, userId)))
          .orderBy(desc(userAchievements.awardedAt))
          .limit(limit),
        db
          .select({
            id: ruleExecutions.id,
            status: ruleExecutions.status,
            error: ruleExecutions.error,
            name: rules.name,
            createdAt: ruleExecutions.createdAt,
          })
          .from(ruleExecutions)
          .innerJoin(events, eq(ruleExecutions.eventId, events.id))
          .innerJoin(rules, eq(ruleExecutions.ruleId, rules.id))
          .where(
            and(
              eq(events.projectId, projectId),
              eq(events.userId, userId),
              ne(ruleExecutions.status, 'skipped')
            )
          )
          .orderBy(desc(ruleExecutions.createdAt))
          .limit(limit),
      ]);

      const data = [
        ...userEvents.map((e) => ({
          id: e.id,
          kind: 'event',
          title: e.type,
          detail: null,
          at: e.occurredAt,
        })),
        ...ledger.map((x) => ({
          id: x.id,
          kind: 'xp',
          title: `${x.amount > 0 ? '+' : ''}${x.amount} XP`,
          detail: x.reason,
          at: x.createdAt,
        })),
        ...badges.map((b) => ({
          id: b.id,
          kind: 'achievement',
          title: b.name,
          detail: null,
          at: b.awardedAt,
        })),
        ...runs.map((r) => ({
          id: r.id,
          kind: 'rule',
          title: `${r.name}: ${r.status}`,
          detail: r.error,
          at: r.createdAt,
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);

      return reply.send({ data });
    }
  );

  // Permanent erasure for GDPR and CCPA requests. DELETE below only deactivates.
  fastify.post<{
    Params: { projectId: string; userId: string };
    Body: { confirm?: boolean };
  }>('/api/projects/:projectId/users/:userId/erase', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    if (request.body?.confirm !== true) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Erasure cannot be undone. Send { "confirm": true } to proceed.',
      });
    }

    const erased = await db.transaction(async (tx) => {
      // Events only have user_id set to null by the cascade, and their payloads can hold personal
      // data, as can queued webhooks. Everything else that names the user cascades from end_users.
      await tx
        .delete(events)
        .where(and(eq(events.projectId, projectId), eq(events.userId, userId)));
      await tx
        .delete(webhookOutbox)
        .where(
          and(
            eq(webhookOutbox.projectId, projectId),
            sql`${webhookOutbox.payload}->>'userId' = ${userId}`
          )
        );
      const [deleted] = await tx
        .delete(endUsers)
        .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)))
        .returning({ id: endUsers.id });

      if (deleted) {
        // Records that an erasure happened, using only the internal ID, which now resolves to nothing.
        await createAuditLog(tx, {
          projectId,
          actorType: authResult.membership ? 'user' : 'api_key',
          actorId: authResult.membership?.userId ?? 'api_key',
          action: 'user.erased',
          severity: 'warning',
          resourceType: 'user',
          resourceId: userId,
        });
      }
      return deleted;
    });

    if (!erased) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }
    return reply.status(200).send({ success: true, message: 'User erased permanently' });
  });

  // 6. DELETE /api/projects/:projectId/users/:userId (Soft-deactivate user - Owner/Admin only)
  fastify.delete<{
    Params: { projectId: string; userId: string };
  }>('/api/projects/:projectId/users/:userId', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const [targetUser] = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)));

    if (!targetUser) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    // Soft deactivation: set active = false, preserve historical data
    const [deactivatedUser] = await db
      .update(endUsers)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)))
      .returning();

    if (targetUser.active) {
      await createWebhookDelivery(db, {
        projectId,
        eventId: `deact_${userId}_${Date.now()}`,
        eventType: 'user.deactivated',
        userId,
        data: { externalId: targetUser.externalId, deactivatedAt: new Date().toISOString() },
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'User account deactivated successfully',
      user: deactivatedUser,
    });
  });
}
