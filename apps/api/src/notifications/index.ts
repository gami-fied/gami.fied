import { db, endUsers, notifications } from '@gami/database';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  // Helper: resolves internal endUsers.id by id or externalId within project scope
  async function resolveEndUserId(projectId: string, userId: string): Promise<string | null> {
    const [userRecord] = await db
      .select({ id: endUsers.id })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, projectId),
          sql`(${endUsers.id} = ${userId} OR ${endUsers.externalId} = ${userId})`
        )
      );

    return userRecord ? userRecord.id : null;
  }

  // 1. List User Notifications (Paginated)
  fastify.get<{
    Params: { projectId: string; userId: string };
    Querystring: { page?: string; limit?: string; unreadOnly?: string };
  }>('/api/projects/:projectId/users/:userId/notifications', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const targetUserId = await resolveEndUserId(projectId, userId);
    if (!targetUserId) {
      return reply
        .status(404)
        .send({ error: 'Not Found', message: 'End user not found in project' });
    }

    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
    const offset = (page - 1) * limit;
    const unreadOnly = request.query.unreadOnly === 'true';

    const baseWhere = unreadOnly
      ? and(
          eq(notifications.projectId, projectId),
          eq(notifications.userId, targetUserId),
          isNull(notifications.readAt)
        )
      : and(eq(notifications.projectId, projectId), eq(notifications.userId, targetUserId));

    const items = await db
      .select()
      .from(notifications)
      .where(baseWhere)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset);

    const [totalRes] = await db.select({ total: count() }).from(notifications).where(baseWhere);

    const [unreadRes] = await db
      .select({ unread: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.projectId, projectId),
          eq(notifications.userId, targetUserId),
          isNull(notifications.readAt)
        )
      );

    return reply.send({
      notifications: items,
      page,
      limit,
      total: totalRes?.total || 0,
      unreadCount: unreadRes?.unread || 0,
    });
  });

  // 2. Unread Notification Count
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/notifications/unread-count',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const targetUserId = await resolveEndUserId(projectId, userId);
      if (!targetUserId) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'End user not found in project' });
      }

      const [unreadRes] = await db
        .select({ unread: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projectId),
            eq(notifications.userId, targetUserId),
            isNull(notifications.readAt)
          )
        );

      return reply.send({
        unreadCount: unreadRes?.unread || 0,
      });
    }
  );

  // 3. Mark Single Notification Read
  fastify.patch<{ Params: { projectId: string; userId: string; notificationId: string } }>(
    '/api/projects/:projectId/users/:userId/notifications/:notificationId/read',
    async (request, reply) => {
      const { projectId, userId, notificationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const targetUserId = await resolveEndUserId(projectId, userId);
      if (!targetUserId) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'End user not found in project' });
      }

      const [updated] = await db
        .update(notifications)
        .set({
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.projectId, projectId),
            eq(notifications.userId, targetUserId)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Not Found', message: 'Notification not found' });
      }

      return reply.send(updated);
    }
  );

  // 4. Mark All Notifications Read
  fastify.post<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/notifications/read-all',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const targetUserId = await resolveEndUserId(projectId, userId);
      if (!targetUserId) {
        return reply
          .status(404)
          .send({ error: 'Not Found', message: 'End user not found in project' });
      }

      const updatedList = await db
        .update(notifications)
        .set({
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.projectId, projectId),
            eq(notifications.userId, targetUserId),
            isNull(notifications.readAt)
          )
        )
        .returning({ id: notifications.id });

      return reply.send({
        count: updatedList.length,
      });
    }
  );
}
