import { auditLogs, db, member, projectMembers, projects, users } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';
import { randomUUID } from 'crypto';

export async function projectMembersRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:projectId/members
  fastify.get<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/members', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    // Fetch members assigned to this project
    const rows = await db
      .select({
        id: projectMembers.id,
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId));

    return reply.send({ members: rows });
  });

  // POST /api/projects/:projectId/members
  fastify.post<{
    Params: { projectId: string };
    Body: { userId: string; role?: string };
  }>('/api/projects/:projectId/members', async (request, reply) => {
    const { projectId } = request.params;
    const [prj] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!prj) {
      return reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    }

    const authResult = await requireOrgRole(request, reply, prj.organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const { userId, role = 'member' } = request.body || {};
    if (!userId || !userId.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'userId is required' });
    }

    // SECURITY RULE: Target user MUST be an active member of this project's organization!
    const [orgMem] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, prj.organizationId), eq(member.userId, userId)));

    if (!orgMem) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot grant project access to a user who is not a member of the organization',
      });
    }

    // Check if user is already assigned to this project
    const [existing] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

    if (existing) {
      return reply.send(existing);
    }

    const pmId = `pm_${randomUUID()}`;
    const [newPM] = await db
      .insert(projectMembers)
      .values({
        id: pmId,
        projectId,
        userId,
        role,
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId: prj.organizationId,
      projectId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.project_member_added',
      severity: 'info',
      resourceType: 'user',
      resourceId: userId,
      metadata: { role },
    });

    return reply.status(201).send(newPM);
  });

  // DELETE /api/projects/:projectId/members/:userId
  fastify.delete<{
    Params: { projectId: string; userId: string };
  }>('/api/projects/:projectId/members/:userId', async (request, reply) => {
    const { projectId, userId } = request.params;
    const [prj] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!prj) {
      return reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    }

    const authResult = await requireOrgRole(request, reply, prj.organizationId, ['owner', 'admin']);
    if (!authResult) return;

    await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId: prj.organizationId,
      projectId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.project_member_removed',
      severity: 'info',
      resourceType: 'user',
      resourceId: userId,
      metadata: {},
    });

    return reply.send({ success: true, message: 'Member removed from project' });
  });
}
