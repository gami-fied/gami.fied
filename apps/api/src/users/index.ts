import crypto from 'crypto';
import { db, endUsers } from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const createUserSchema = z.object({
  externalId: z.string().min(1).max(128),
  name: z.string().max(128).optional().nullable(),
  avatarUrl: z.string().url().max(512).optional().nullable().or(z.literal('')),
  metadata: z.record(z.unknown()).optional().default({}),
});

const updateUserSchema = z.object({
  name: z.string().max(128).optional().nullable(),
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

    const { externalId, name, avatarUrl, metadata } = parseResult.data;

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

    const { name, avatarUrl, metadata, active } = parseResult.data;

    const updateData: Partial<typeof endUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name || null;
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
