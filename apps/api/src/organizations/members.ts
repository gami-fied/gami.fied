import { auditLogs, db, member, projectMembers, projects, users } from '@gami/database';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgMember, requireOrgRole } from '../authorization/index.js';
import { randomUUID } from 'crypto';

export async function organizationMembersRoutes(fastify: FastifyInstance) {
  // GET /api/organizations/:organizationId/members
  fastify.get<{
    Params: { organizationId: string };
    Querystring: { q?: string; role?: string; page?: string; limit?: string };
  }>('/api/organizations/:organizationId/members', async (request, reply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgMember(request, reply, organizationId);
    if (!authResult) return;

    const { q, role, page = '1', limit = '20' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Base query joining member and users
    let query = db
      .select({
        id: member.id,
        organizationId: member.organizationId,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(member)
      .innerJoin(users, eq(member.userId, users.id))
      .where(eq(member.organizationId, organizationId));

    // Search filter (name or email)
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      query = db
        .select({
          id: member.id,
          organizationId: member.organizationId,
          userId: member.userId,
          role: member.role,
          createdAt: member.createdAt,
          name: users.name,
          email: users.email,
          image: users.image,
        })
        .from(member)
        .innerJoin(users, eq(member.userId, users.id))
        .where(
          and(
            eq(member.organizationId, organizationId),
            or(ilike(users.name, searchTerm), ilike(users.email, searchTerm))
          )
        );
    }

    const allRows = await query;
    const filtered = role ? allRows.filter((r) => r.role === role) : allRows;
    const paginated = filtered.slice(offset, offset + limitNum);

    return reply.send({
      members: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limitNum),
      },
    });
  });

  // GET /api/organizations/:organizationId/members/:userId
  fastify.get<{
    Params: { organizationId: string; userId: string };
  }>('/api/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params;
    const authResult = await requireOrgMember(request, reply, organizationId);
    if (!authResult) return;

    const [memRow] = await db
      .select({
        id: member.id,
        organizationId: member.organizationId,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(member)
      .innerJoin(users, eq(member.userId, users.id))
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));

    if (!memRow) {
      return reply.status(404).send({ error: 'Not Found', message: 'Organization member not found' });
    }

    // Get assigned projects for this member
    const assignedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projects.organizationId, organizationId), eq(projectMembers.userId, userId)));

    return reply.send({
      member: memRow,
      projects: assignedProjects,
    });
  });

  // PATCH /api/organizations/:organizationId/members/:userId
  fastify.patch<{
    Params: { organizationId: string; userId: string };
    Body: { role: 'owner' | 'admin' | 'member' };
  }>('/api/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const { role } = request.body || {};
    if (!role || !['owner', 'admin', 'member'].includes(role)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Valid role is required (owner, admin, member)' });
    }

    // Rule: Prevent modifying own role
    if (authResult.session.user.id === userId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Cannot modify your own organization role' });
    }

    // Fetch target member
    const [targetMember] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));

    if (!targetMember) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in organization' });
    }

    // Rule: Prevent demoting/changing role of organization owner
    if (targetMember.role === 'owner') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Cannot modify role of organization owner' });
    }

    // Rule: Non-owners cannot assign 'owner' role
    if (role === 'owner' && authResult.membership.role !== 'owner') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only current owner can transfer ownership' });
    }

    // Update role
    const [updated] = await db
      .update(member)
      .set({ role })
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.member_role_changed',
      severity: 'info',
      resourceType: 'user',
      resourceId: userId,
      metadata: { previousRole: targetMember.role, newRole: role },
    });

    return reply.send(updated);
  });

  // DELETE /api/organizations/:organizationId/members/:userId
  fastify.delete<{
    Params: { organizationId: string; userId: string };
  }>('/api/organizations/:organizationId/members/:userId', async (request, reply) => {
    const { organizationId, userId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    // Fetch target member
    const [targetMember] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));

    if (!targetMember) {
      return reply.status(404).send({ error: 'Not Found', message: 'Member not found in organization' });
    }

    // Rule: Cannot remove organization owner
    if (targetMember.role === 'owner') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Cannot remove organization owner' });
    }

    // Rule: Admin cannot remove another admin or owner
    if (authResult.membership.role === 'admin' && ['owner', 'admin'].includes(targetMember.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admins cannot remove other admins or owners' });
    }

    // Delete member row
    await db
      .delete(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));

    // Clean up project memberships for projects in this org
    const orgProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    for (const prj of orgProjects) {
      await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, prj.id), eq(projectMembers.userId, userId)));
    }

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.member_removed',
      severity: 'warning',
      resourceType: 'user',
      resourceId: userId,
      metadata: { removedRole: targetMember.role },
    });

    return reply.send({ success: true, message: 'Member removed from organization' });
  });
}
