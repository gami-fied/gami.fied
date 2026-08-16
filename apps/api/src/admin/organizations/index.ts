import { db, endUsers, member, organizations, projects } from '@gami/database';
import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../../audit-logs/index.js';
import { requirePlatformAdmin } from '../../authorization/index.js';

const updateOrgStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export async function adminOrganizationRoutes(fastify: FastifyInstance) {
  // 1. GET /api/admin/organizations (Paginated Organization Roster)
  fastify.get<{
    Querystring: { page?: string; limit?: string; search?: string; status?: string };
  }>('/api/admin/organizations', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
    const offset = (page - 1) * limit;

    const { search, status } = request.query;

    const conditions = [];
    if (search && search.trim()) {
      conditions.push(ilike(organizations.name, `%${search.trim()}%`));
    }
    if (status && status.trim()) {
      conditions.push(eq(organizations.status, status.trim()));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRow] = await db
      .select({ count: count() })
      .from(organizations)
      .where(whereClause);

    const total = totalCountRow?.count || 0;

    const orgRows = await db
      .select()
      .from(organizations)
      .where(whereClause)
      .orderBy(desc(organizations.createdAt))
      .limit(limit)
      .offset(offset);

    // Populate project count and member count for each organization
    const orgList = await Promise.all(
      orgRows.map(async (org) => {
        const [[prjCountRow], [memberCountRow]] = await Promise.all([
          db.select({ count: count() }).from(projects).where(eq(projects.organizationId, org.id)),
          db.select({ count: count() }).from(member).where(eq(member.organizationId, org.id)),
        ]);
        return {
          ...org,
          projectCount: prjCountRow?.count || 0,
          memberCount: memberCountRow?.count || 0,
        };
      })
    );

    return reply.send({
      organizations: orgList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // 2. GET /api/admin/organizations/:organizationId (Organization Details)
  fastify.get<{ Params: { organizationId: string } }>(
    '/api/admin/organizations/:organizationId',
    async (request, reply) => {
      const adminAuth = await requirePlatformAdmin(request, reply);
      if (!adminAuth) return;

      const { organizationId } = request.params;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!org) {
        return reply.status(404).send({ error: 'Not Found', message: 'Organization not found' });
      }

      const orgProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.organizationId, organizationId));

      const [[memberCountRow]] = await Promise.all([
        db.select({ count: count() }).from(member).where(eq(member.organizationId, organizationId)),
      ]);

      return reply.send({
        organization: org,
        projectCount: orgProjects.length,
        memberCount: memberCountRow?.count || 0,
        projects: orgProjects,
      });
    }
  );

  // 3. PATCH /api/admin/organizations/:organizationId (Suspend / Reactivate Organization)
  fastify.patch<{ Params: { organizationId: string } }>(
    '/api/admin/organizations/:organizationId',
    async (request, reply) => {
      const adminAuth = await requirePlatformAdmin(request, reply);
      if (!adminAuth) return;

      const { organizationId } = request.params;

      const parseResult = updateOrgStatusSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid status update payload',
          details: parseResult.error.format(),
        });
      }

      const { status } = parseResult.data;

      const [targetOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!targetOrg) {
        return reply.status(404).send({ error: 'Not Found', message: 'Organization not found' });
      }

      const [updatedOrg] = await db
        .update(organizations)
        .set({ status, updatedAt: new Date() })
        .where(eq(organizations.id, organizationId))
        .returning();

      // Log Security Audit Event
      const isSuspended = status === 'suspended';
      try {
        await createAuditLog(db, {
          organizationId,
          actorType: 'user',
          actorId: adminAuth.session.user.id,
          action: isSuspended ? 'admin.organization_suspended' : 'admin.organization_reactivated',
          severity: isSuspended ? 'warning' : 'info',
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: {
            organizationName: targetOrg.name,
            previousStatus: targetOrg.status,
            newStatus: status,
          },
        });
      } catch {}

      return reply.send({
        message: `Organization ${isSuspended ? 'suspended' : 'reactivated'} successfully`,
        organization: updatedOrg,
      });
    }
  );
}
