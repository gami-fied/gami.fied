import { db, member, organizations, projectMembers, projects, users } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../authorization/index.js';

/**
 * What the dashboard needs before it can show anything: the user's organizations and the
 * projects they can see in one of them. Loading these together replaces a chain of requests.
 */
export async function bootstrapRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { organizationId?: string } }>(
    '/api/bootstrap',
    async (request, reply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;
      const userId = session.user.id;

      const [memberships, [viewer]] = await Promise.all([
        db
          .select({ organization: organizations, role: member.role })
          .from(member)
          .innerJoin(organizations, eq(organizations.id, member.organizationId))
          .where(eq(member.userId, userId)),
        db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)),
      ]);

      const orgs = memberships.map((m) => ({ ...m.organization, role: m.role }));
      const active = orgs.find((o) => o.id === request.query.organizationId) ?? orgs[0];
      const isPlatformAdmin = Boolean(viewer?.isPlatformAdmin);

      if (!active || (active.status === 'suspended' && !isPlatformAdmin)) {
        return reply.send({
          organizations: orgs,
          organizationId: active?.id ?? null,
          projects: [],
          isPlatformAdmin,
        });
      }

      const seesAllProjects = isPlatformAdmin || ['owner', 'admin'].includes(active.role);
      const visible = await db
        .selectDistinct({ project: projects })
        .from(projects)
        .leftJoin(
          projectMembers,
          and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
        )
        .where(
          seesAllProjects
            ? eq(projects.organizationId, active.id)
            : and(eq(projects.organizationId, active.id), eq(projectMembers.userId, userId))
        );

      return reply.send({
        organizations: orgs,
        organizationId: active.id,
        projects: visible.map((row) => row.project),
        isPlatformAdmin,
      });
    }
  );
}
