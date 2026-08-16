import { db, levels, member, projects, projectMembers } from '@gami/database';
import { getDefaultLevelDefinitions } from '@gami/progression';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  requireAuth,
  requireOrgMember,
  requireOrgRole,
  requireProjectAccess,
} from '../authorization/index.js';

export async function projectRoutes(fastify: FastifyInstance) {
  // Create project
  fastify.post('/api/projects', async (request, reply) => {
    const { organizationId, name, slug } =
      (request.body as { organizationId?: string; name?: string; slug?: string }) || {};

    if (!organizationId || !name || !slug) {
      return reply
        .status(400)
        .send({ error: 'Bad Request', message: 'organizationId, name, and slug are required' });
    }

    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const prjId = `prj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const newPrj = await db.transaction(async (tx) => {
        const [createdPrj] = await tx
          .insert(projects)
          .values({
            id: prjId,
            organizationId,
            name,
            slug,
          })
          .returning();

        // Automatically seed default 5 levels for newly created projects
        const defaultLevels = getDefaultLevelDefinitions(prjId);
        const levelValues = defaultLevels.map((lvl, idx) => ({
          id: `lvl_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          projectId: prjId,
          level: lvl.level,
          name: lvl.name,
          description: lvl.description,
          iconUrl: lvl.iconUrl,
          enabled: lvl.enabled ?? true,
          requiredXp: Number(lvl.requiredXp),
        }));

        await tx.insert(levels).values(levelValues);

        return createdPrj;
      });

      return reply.status(201).send(newPrj);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === '23505') {
        return reply
          .status(409)
          .send({ error: 'Conflict', message: 'Project slug already exists in this organization' });
      }
      throw err;
    }
  });

  // List projects for an organization (or all orgs user belongs to)
  fastify.get<{ Querystring: { organizationId?: string } }>(
    '/api/projects',
    async (request, reply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const targetOrgId = request.query.organizationId;

      if (targetOrgId) {
        const authResult = await requireOrgMember(request, reply, targetOrgId);
        if (!authResult) return;

        const prjs = await db
          .select()
          .from(projects)
          .where(eq(projects.organizationId, targetOrgId));

        const isPlatformAdmin = Boolean(
          (authResult.session?.user as any)?.role === 'admin' ||
            (authResult.session?.user as any)?.isPlatformAdmin
        );

        // Platform Admin or Org Owner/Admin -> Full access to all org projects
        if (
          isPlatformAdmin ||
          ['owner', 'admin'].includes(authResult.membership.role)
        ) {
          return reply.send(prjs);
        }

        // Regular Member -> Must only return projects explicitly assigned in project_members table
        const userAssignments = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, authResult.session.user.id));

        const assignedProjectIds = new Set(userAssignments.map((a) => a.projectId));
        const filteredPrjs = prjs.filter((p) => assignedProjectIds.has(p.id));
        return reply.send(filteredPrjs);
      }

      // If no org specified, return projects for all orgs caller belongs to with role filtering
      const userMemberships = await db
        .select()
        .from(member)
        .where(eq(member.userId, session.user.id));

      if (userMemberships.length === 0) {
        return reply.send([]);
      }

      const adminOrgIds = new Set(
        userMemberships
          .filter((m) => ['owner', 'admin'].includes(m.role))
          .map((m) => m.organizationId)
      );

      const userAssignments = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, session.user.id));
      const assignedProjectIds = new Set(userAssignments.map((a) => a.projectId));

      const orgIds = userMemberships.map((m) => m.organizationId);
      const prjs = await db.select().from(projects).where(inArray(projects.organizationId, orgIds));

      if ((session.user as any).isPlatformAdmin) {
        return reply.send(prjs);
      }

      const filteredPrjs = prjs.filter(
        (p) => adminOrgIds.has(p.organizationId) || assignedProjectIds.has(p.id)
      );

      return reply.send(filteredPrjs);
    }
  );

  // Get project (Tenant / IDOR protected)
  fastify.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const prjId = request.params.id;
    const authResult = await requireProjectAccess(request, reply, prjId);
    if (!authResult) return;

    return reply.send(authResult.project);
  });

  // Update project (Owner or Admin of project's org)
  fastify.patch<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const prjId = request.params.id;
    const authResult = await requireProjectAccess(request, reply, prjId);
    if (!authResult) return;

    if (!['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const { name, slug } = (request.body as { name?: string; slug?: string }) || {};

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name) updateData['name'] = name;
    if (slug) updateData['slug'] = slug;

    try {
      const [updatedPrj] = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, prjId))
        .returning();

      return reply.send(updatedPrj);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === '23505') {
        return reply
          .status(409)
          .send({ error: 'Conflict', message: 'Project slug already exists in this organization' });
      }
      throw err;
    }
  });

  // Delete project (Owner or Admin of project's org)
  fastify.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const prjId = request.params.id;
    const authResult = await requireProjectAccess(request, reply, prjId);
    if (!authResult) return;

    if (!['owner', 'admin'].includes(authResult.membership.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    await db.delete(projects).where(eq(projects.id, prjId));
    return reply.send({ success: true, message: 'Project deleted' });
  });
}
