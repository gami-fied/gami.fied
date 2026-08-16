import { db, member, organizations } from '@gami/database';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireOrgMember, requireOrgRole } from '../authorization/index.js';
import { organizationMembersRoutes } from './members.js';
import { organizationInvitationsRoutes } from './invitations.js';
import { organizationOwnershipRoutes } from './ownership.js';
import { projectMembersRoutes } from '../projects/members.js';

export async function organizationRoutes(fastify: FastifyInstance) {
  // Create organization
  fastify.post('/api/organizations', async (request, reply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { name, slug } = (request.body as { name?: string; slug?: string }) || {};

    if (!name || !slug) {
      return reply
        .status(400)
        .send({ error: 'Bad Request', message: 'Name and slug are required' });
    }

    const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const [newOrg] = await db
        .insert(organizations)
        .values({
          id: orgId,
          name,
          slug,
        })
        .returning();

      await db.insert(member).values({
        id: memberId,
        organizationId: orgId,
        userId: session.user.id,
        role: 'owner',
      });

      return reply.status(201).send(newOrg);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === '23505') {
        return reply
          .status(409)
          .send({ error: 'Conflict', message: 'Organization slug already exists' });
      }
      throw err;
    }
  });

  // List user's organizations
  fastify.get('/api/organizations', async (request, reply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const userMemberships = await db
      .select()
      .from(member)
      .where(eq(member.userId, session.user.id));

    if (userMemberships.length === 0) {
      return reply.send([]);
    }

    const orgIds = userMemberships.map((m) => m.organizationId);
    const orgs = await db.select().from(organizations).where(inArray(organizations.id, orgIds));

    const result = orgs.map((org) => {
      const mem = userMemberships.find((m) => m.organizationId === org.id);
      return {
        ...org,
        role: mem?.role || 'member',
      };
    });

    return reply.send(result);
  });

  // Get specific organization
  fastify.get<{ Params: { id: string } }>('/api/organizations/:id', async (request, reply) => {
    const orgId = request.params.id;
    const authResult = await requireOrgMember(request, reply, orgId);
    if (!authResult) return;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org) {
      return reply.status(404).send({ error: 'Not Found', message: 'Organization not found' });
    }

    return reply.send({
      ...org,
      role: authResult.membership.role,
    });
  });

  // Update organization (Owner or Admin)
  fastify.patch<{ Params: { id: string } }>('/api/organizations/:id', async (request, reply) => {
    const orgId = request.params.id;
    const authResult = await requireOrgRole(request, reply, orgId, ['owner', 'admin']);
    if (!authResult) return;

    const { name, slug } = (request.body as { name?: string; slug?: string }) || {};

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name) updateData['name'] = name;
    if (slug) updateData['slug'] = slug;

    try {
      const [updatedOrg] = await db
        .update(organizations)
        .set(updateData)
        .where(eq(organizations.id, orgId))
        .returning();

      return reply.send(updatedOrg);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === '23505') {
        return reply
          .status(409)
          .send({ error: 'Conflict', message: 'Organization slug already exists' });
      }
      throw err;
    }
  });

  // Delete organization (Owner only)
  fastify.delete<{ Params: { id: string } }>('/api/organizations/:id', async (request, reply) => {
    const orgId = request.params.id;
    const authResult = await requireOrgRole(request, reply, orgId, ['owner']);
    if (!authResult) return;

    await db.delete(organizations).where(eq(organizations.id, orgId));
    return reply.send({ success: true, message: 'Organization deleted' });
  });

  // Sub-routes: Members, Invitations, Ownership Transfer, Project Members
  await fastify.register(organizationMembersRoutes);
  await fastify.register(organizationInvitationsRoutes);
  await fastify.register(organizationOwnershipRoutes);
  await fastify.register(projectMembersRoutes);
}
