import { auditLogs, db } from '@gami/database';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';

export async function adminAuditLogRoutes(fastify: FastifyInstance) {
  // GET /api/admin/audit-logs (Global Audit Logs Search for Platform Admins)
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      organizationId?: string;
      projectId?: string;
      actorId?: string;
      action?: string;
      resourceType?: string;
      severity?: string;
      startDate?: string;
      endDate?: string;
    };
  }>('/api/admin/audit-logs', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
    const offset = (page - 1) * limit;

    const {
      organizationId,
      projectId,
      actorId,
      action,
      resourceType,
      severity,
      startDate,
      endDate,
    } = request.query;

    const conditions = [];

    if (organizationId) conditions.push(eq(auditLogs.organizationId, organizationId));
    if (projectId) conditions.push(eq(auditLogs.projectId, projectId));
    if (actorId) conditions.push(eq(auditLogs.actorId, actorId));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
    if (severity) conditions.push(eq(auditLogs.severity, severity));
    if (startDate) conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(auditLogs.createdAt, new Date(endDate)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    const total = totalCountRow?.count || 0;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      auditLogs: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}
