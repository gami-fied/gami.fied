import crypto from 'crypto';
import { auditLogs, db } from '@gami/database';
import { redactSensitiveData } from '@gami/config';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';

export interface CreateAuditLogParams {
  projectId: string;
  actorType: 'user' | 'system' | 'api_key';
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log record, automatically applying redactSensitiveData shield to metadata.
 * Can be executed inside an existing PostgreSQL transaction.
 */
export async function createAuditLog(
  client: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: CreateAuditLogParams
): Promise<void> {
  const { projectId, actorType, actorId, action, resourceType, resourceId, metadata } = params;
  const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const safeMetadata = redactSensitiveData(metadata || {});

  await client.insert(auditLogs).values({
    id: auditId,
    projectId,
    actorType,
    actorId,
    action,
    resourceType,
    resourceId,
    metadata: safeMetadata,
    createdAt: new Date(),
  });
}

export async function auditLogRoutes(fastify: FastifyInstance) {
  // List Audit Logs (Owner/Admin)
  fastify.get<{
    Params: { projectId: string };
    Querystring: {
      page?: string;
      limit?: string;
      action?: string;
      resourceType?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
    };
  }>('/api/projects/:projectId/audit-logs', async (request, reply) => {
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

    const { action, resourceType, actorId, startDate, endDate } = request.query;

    const conditions = [eq(auditLogs.projectId, projectId)];

    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }
    if (resourceType) {
      conditions.push(eq(auditLogs.resourceType, resourceType));
    }
    if (actorId) {
      conditions.push(eq(auditLogs.actorId, actorId));
    }
    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const whereClause = and(...conditions);

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

    // Apply redaction shield to safety-check returned payload
    const safeLogs = logs.map((log) => ({
      ...log,
      metadata: redactSensitiveData(log.metadata),
    }));

    return reply.send({
      auditLogs: safeLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}
