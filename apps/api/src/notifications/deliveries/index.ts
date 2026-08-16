import { db, emailNotificationOutbox } from '@gami/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../../authorization/index.js';

export async function emailDeliveryRoutes(fastify: FastifyInstance) {
  // Get Email Notification Deliveries (Owner/Admin)
  fastify.get<{
    Params: { projectId: string };
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      recipientEmail?: string;
    };
  }>('/api/projects/:projectId/email-deliveries', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
      'owner',
      'admin',
    ]);
    if (!orgAuth) return;

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const { status, recipientEmail } = request.query;

    const conditions = [eq(emailNotificationOutbox.projectId, projectId)];

    if (status) {
      conditions.push(eq(emailNotificationOutbox.status, status));
    }
    if (recipientEmail) {
      conditions.push(eq(emailNotificationOutbox.recipientEmail, recipientEmail));
    }

    const whereClause = and(...conditions);

    const [totalCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailNotificationOutbox)
      .where(whereClause);

    const total = totalCountRow?.count || 0;

    const deliveries = await db
      .select()
      .from(emailNotificationOutbox)
      .where(whereClause)
      .orderBy(desc(emailNotificationOutbox.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}
