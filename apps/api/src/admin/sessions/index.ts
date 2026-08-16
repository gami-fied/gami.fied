import { db, session, users } from '@gami/database';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../../audit-logs/index.js';
import { requirePlatformAdmin } from '../../authorization/index.js';

const revokeAllSchema = z.object({
  targetUserId: z.string().min(1),
});

export async function adminSessionRoutes(fastify: FastifyInstance) {
  // GET /api/admin/sessions (List active sessions)
  fastify.get<{
    Querystring: { page?: string; limit?: string; userId?: string };
  }>('/api/admin/sessions', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
    const offset = (page - 1) * limit;

    const { userId } = request.query;

    const whereClause = userId ? eq(session.userId, userId) : undefined;

    const [totalCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(session)
      .where(whereClause);

    const total = totalCountRow?.count || 0;

    const sessionRows = await db
      .select({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        userName: users.name,
        userEmail: users.email,
        isPlatformAdmin: users.isPlatformAdmin,
      })
      .from(session)
      .innerJoin(users, eq(session.userId, users.id))
      .where(whereClause)
      .orderBy(desc(session.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      sessions: sessionRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // POST /api/admin/sessions/revoke-all (Revoke all active sessions for a target user)
  fastify.post('/api/admin/sessions/revoke-all', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const parseResult = revokeAllSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid revoke request payload',
        details: parseResult.error.format(),
      });
    }

    const { targetUserId } = parseResult.data;

    const deletedSessions = await db
      .delete(session)
      .where(eq(session.userId, targetUserId))
      .returning({ id: session.id });

    try {
      await createAuditLog(db, {
        actorType: 'user',
        actorId: adminAuth.session.user.id,
        action: 'admin.bulk_session_revoked',
        severity: 'warning',
        resourceType: 'user_session',
        resourceId: targetUserId,
        metadata: {
          revokedCount: deletedSessions.length,
          targetUserId,
        },
      });
    } catch {}

    return reply.send({
      message: `Revoked ${deletedSessions.length} session(s) for user ${targetUserId}`,
      revokedCount: deletedSessions.length,
    });
  });
}
