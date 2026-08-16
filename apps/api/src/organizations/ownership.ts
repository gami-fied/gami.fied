import { auditLogs, db, member, organizations, users } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole } from '../authorization/index.js';
import { randomUUID } from 'crypto';

export async function organizationOwnershipRoutes(fastify: FastifyInstance) {
  // POST /api/organizations/:organizationId/transfer-ownership
  fastify.post<{
    Params: { organizationId: string };
    Body: { targetUserId: string };
  }>('/api/organizations/:organizationId/transfer-ownership', async (request, reply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner']);
    if (!authResult) return;

    const { targetUserId } = request.body || {};
    if (!targetUserId || !targetUserId.trim()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'targetUserId is required' });
    }

    const currentOwnerId = authResult.session.user.id;

    if (currentOwnerId === targetUserId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'You are already the owner of this organization' });
    }

    // Verify target user exists and is an active user account
    const [targetUser] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!targetUser) {
      return reply.status(404).send({ error: 'Not Found', message: 'Target user account does not exist' });
    }

    // Verify target user is an active member of this organization
    const [targetMem] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, targetUserId)));

    if (!targetMem) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Target user must be an active member of this organization before receiving ownership',
      });
    }

    // Atomic transaction: Demote current owner to 'admin' and promote target member to 'owner'
    await db.transaction(async (tx) => {
      await tx
        .update(member)
        .set({ role: 'admin' })
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, currentOwnerId)));

      await tx
        .update(member)
        .set({ role: 'owner' })
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, targetUserId)));

      // Audit log
      await tx.insert(auditLogs).values({
        id: `aud_${randomUUID()}`,
        organizationId,
        actorType: 'user',
        actorId: currentOwnerId,
        action: 'organization.ownership_transferred',
        severity: 'critical',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: {
          previousOwnerId: currentOwnerId,
          newOwnerId: targetUserId,
          newOwnerEmail: targetUser.email,
        },
      });
    });

    return reply.send({
      success: true,
      message: `Organization ownership transferred to ${targetUser.email}`,
      previousOwnerRole: 'admin',
      newOwnerId: targetUserId,
    });
  });
}
