import { db, levels, member, projects, projectMembers, isUniqueViolation } from '@gami/database';
import { getDefaultLevelDefinitions } from '@gami/progression';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requireAuth,
  requireOrgMember,
  requireOrgRole,
  requireProjectAccess,
} from '../authorization/index.js';
import { checkProjectQuota } from '../organizations/policy-checks.js';

type SessionUserFlags = { role?: string; isPlatformAdmin?: boolean };

const originSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, 'Must be an origin, with no path');

const updateProjectSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  slug: z.string().min(1).max(128).optional(),
  allowedOrigins: z.array(originSchema).max(50).optional(),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  /** Where this project's configuration is promoted to. Must be another project in the same organization. */
  promotesToProjectId: z.string().min(1).max(128).nullable().optional(),
});

export async function projectRoutes(fastify: FastifyInstance) {
  // Create project
  fastify.post('/api/projects', async (request, reply) => {
    const { organizationId, name, slug, environment } =
      (request.body as { organizationId?: string; name?: string; slug?: string; environment?: string }) || {};
    if (environment !== undefined && !['production', 'staging', 'development'].includes(environment)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'environment must be production, staging or development' });
    }

    if (!organizationId || !name || !slug) {
      return reply
        .status(400)
        .send({ error: 'Bad Request', message: 'organizationId, name, and slug are required' });
    }

    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const quota = await checkProjectQuota(organizationId);
    if (quota) return reply.status(quota.status).send({ error: quota.code, code: quota.code, message: quota.message });

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
            ...(environment ? { environment: environment as 'production' | 'staging' | 'development' } : {}),
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
      if (isUniqueViolation(err)) {
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
          (authResult.session?.user as SessionUserFlags | undefined)?.role === 'admin' ||
            (authResult.session?.user as SessionUserFlags | undefined)?.isPlatformAdmin
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

      if ((session.user as SessionUserFlags).isPlatformAdmin) {
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

    const parsed = updateProjectSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'BAD_REQUEST',
        message: 'Invalid project update',
        details: parsed.error.format(),
      });
    }
    const { name, slug, allowedOrigins, environment, promotesToProjectId } = parsed.data;
    if (promotesToProjectId) {
      if (promotesToProjectId === prjId) {
        return reply.status(400).send({ error: 'Bad Request', message: 'A project cannot promote to itself' });
      }
      const [target] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, promotesToProjectId));
      if (!target || target.organizationId !== authResult.project.organizationId) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Choose a project in the same organization' });
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name) updateData['name'] = name;
    if (slug) updateData['slug'] = slug;
    if (allowedOrigins) updateData['allowedOrigins'] = allowedOrigins;
    // Existing keys keep their prefix. Keys made after the change get the new one.
    if (environment) updateData['environment'] = environment;
    if (promotesToProjectId !== undefined) updateData['promotesToProjectId'] = promotesToProjectId;

    try {
      const [updatedPrj] = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, prjId))
        .returning();

      return reply.send(updatedPrj);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
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
