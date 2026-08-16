import {
  auditLogs,
  db,
  emailNotificationOutbox,
  invitation,
  member,
  organizations,
  projectMembers,
  users,
} from '@gami/database';
import { renderInvitationEmailTemplate } from '@gami/notifications';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireOrgRole, checkOrgSuspension } from '../authorization/index.js';

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export async function organizationInvitationsRoutes(fastify: FastifyInstance) {
  // POST /api/organizations/:organizationId/invitations
  fastify.post<{
    Params: { organizationId: string };
    Body: { email: string; role?: 'admin' | 'member'; projectIds?: string[] };
  }>('/api/organizations/:organizationId/invitations', async (request, reply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const { email, role = 'member', projectIds = [] } = request.body || {};
    if (!email || !email.trim() || !email.includes('@')) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Valid recipient email is required' });
    }

    if (!['admin', 'member'].includes(role)) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid invitation role' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user with this email is already a member of the organization
    const [existingMember] = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(users, eq(member.userId, users.id))
      .where(and(eq(member.organizationId, organizationId), eq(users.email, cleanEmail)));

    if (existingMember) {
      return reply.status(400).send({ error: 'Bad Request', message: 'User is already a member of this organization' });
    }

    // Check for active pending invitation for this email in this org
    const now = new Date();
    const [pendingInv] = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.email, cleanEmail),
          eq(invitation.status, 'pending'),
          gte(invitation.expiresAt, now)
        )
      );

    if (pendingInv) {
      return reply.status(409).send({ error: 'Conflict', message: 'A pending invitation already exists for this email address' });
    }

    // Generate secure token & token hash
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashInvitationToken(rawToken);

    const invId = `inv_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000); // 7 days

    const [newInv] = await db
      .insert(invitation)
      .values({
        id: invId,
        organizationId,
        email: cleanEmail,
        role,
        status: 'pending',
        tokenHash,
        expiresAt,
        inviterId: authResult.session.user.id,
        projectIds: Array.isArray(projectIds) ? projectIds : [],
      })
      .returning();

    if (!newInv) {
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to create invitation' });
    }

    // Fetch org & inviter details for email
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
    const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, authResult.session.user.id));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/accept-invitation?token=${rawToken}`;

    // Queue invitation email intent if outbox supported
    try {
      const { subject, htmlBody, textBody } = renderInvitationEmailTemplate({
        organizationName: org ? org.name : 'Organization',
        inviterName: inviter ? inviter.name : 'Team Administrator',
        role,
        expiresAt,
        acceptUrl,
      });

      await db.insert(emailNotificationOutbox).values({
        id: `eob_${randomUUID()}`,
        recipientEmail: cleanEmail,
        subject,
        htmlBody,
        textBody,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
      });
    } catch (err) {
      console.error('[Invitations] Error inserting email outbox intent:', (err as Error).message);
    }

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.member_invited',
      severity: 'info',
      resourceType: 'invitation',
      resourceId: newInv.id,
      metadata: { email: cleanEmail, role },
    });

    return reply.status(201).send({
      id: newInv.id,
      organizationId: newInv.organizationId,
      email: newInv.email,
      role: newInv.role,
      status: newInv.status,
      expiresAt: newInv.expiresAt,
      inviterId: newInv.inviterId,
      invitationUrl: acceptUrl,
    });
  });

  // GET /api/organizations/:organizationId/invitations
  fastify.get<{
    Params: { organizationId: string };
  }>('/api/organizations/:organizationId/invitations', async (request, reply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const rows = await db
      .select({
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviterId: invitation.inviterId,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        inviterName: users.name,
        inviterEmail: users.email,
      })
      .from(invitation)
      .innerJoin(users, eq(invitation.inviterId, users.id))
      .where(eq(invitation.organizationId, organizationId));

    return reply.send({ invitations: rows });
  });

  // POST /api/organizations/:organizationId/invitations/:invitationId/resend
  fastify.post<{
    Params: { organizationId: string; invitationId: string };
  }>('/api/organizations/:organizationId/invitations/:invitationId/resend', async (request, reply) => {
    const { organizationId, invitationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const [existingInv] = await db
      .select()
      .from(invitation)
      .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, organizationId)));

    if (!existingInv) {
      return reply.status(404).send({ error: 'Not Found', message: 'Invitation not found' });
    }

    if (existingInv.status === 'accepted') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Cannot resend an already accepted invitation' });
    }

    // Generate new token & SHA-256 hash
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000);

    const [updated] = await db
      .update(invitation)
      .set({
        tokenHash,
        status: 'pending',
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(invitation.id, invitationId))
      .returning();

    if (!updated) {
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to resend invitation' });
    }

    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
    const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, authResult.session.user.id));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/accept-invitation?token=${rawToken}`;

    try {
      const { subject, htmlBody, textBody } = renderInvitationEmailTemplate({
        organizationName: org ? org.name : 'Organization',
        inviterName: inviter ? inviter.name : 'Team Administrator',
        role: existingInv.role,
        expiresAt,
        acceptUrl,
      });

      await db.insert(emailNotificationOutbox).values({
        id: `eob_${randomUUID()}`,
        recipientEmail: existingInv.email,
        subject,
        htmlBody,
        textBody,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
      });
    } catch (err) {
      console.error('[Invitations] Error inserting email outbox intent on resend:', (err as Error).message);
    }

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.invitation_resent',
      severity: 'info',
      resourceType: 'invitation',
      resourceId: existingInv.id,
      metadata: { email: existingInv.email },
    });

    return reply.send({
      id: updated.id,
      email: updated.email,
      status: updated.status,
      expiresAt: updated.expiresAt,
      invitationUrl: acceptUrl,
    });
  });

  // DELETE /api/organizations/:organizationId/invitations/:invitationId
  fastify.delete<{
    Params: { organizationId: string; invitationId: string };
  }>('/api/organizations/:organizationId/invitations/:invitationId', async (request, reply) => {
    const { organizationId, invitationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const [existingInv] = await db
      .select()
      .from(invitation)
      .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, organizationId)));

    if (!existingInv) {
      return reply.status(404).send({ error: 'Not Found', message: 'Invitation not found' });
    }

    await db
      .update(invitation)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invitation.id, invitationId));

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: 'user',
      actorId: authResult.session.user.id,
      action: 'organization.invitation_revoked',
      severity: 'warning',
      resourceType: 'invitation',
      resourceId: existingInv.id,
      metadata: { email: existingInv.email },
    });

    return reply.send({ success: true, message: 'Invitation revoked' });
  });

  // GET /api/invitations/:token (Public Details Query)
  fastify.get<{
    Params: { token: string };
  }>('/api/invitations/:token', async (request, reply) => {
    const { token } = request.params;
    const tokenHash = hashInvitationToken(token);

    const [inv] = await db
      .select({
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviterId: invitation.inviterId,
      })
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash));

    if (!inv) {
      return reply.status(404).send({ error: 'Not Found', message: 'Invitation token is invalid or does not exist' });
    }

    const [org] = await db.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, inv.organizationId));
    const [inviter] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, inv.inviterId));

    const isExpired = new Date() > new Date(inv.expiresAt);

    return reply.send({
      id: inv.id,
      organizationId: inv.organizationId,
      organizationName: org ? org.name : 'Organization',
      organizationSlug: org ? org.slug : '',
      email: inv.email,
      role: inv.role,
      status: isExpired && inv.status === 'pending' ? 'expired' : inv.status,
      expiresAt: inv.expiresAt,
      inviterName: inviter ? inviter.name : 'Team Administrator',
      inviterEmail: inviter ? inviter.email : '',
      isExpired,
    });
  });

  // POST /api/invitations/:token/accept (Accept Invitation)
  fastify.post<{
    Params: { token: string };
  }>('/api/invitations/:token/accept', async (request, reply) => {
    const session = await requireAuth(request, reply);
    if (!session) return;

    const { token } = request.params;
    const tokenHash = hashInvitationToken(token);

    const [inv] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash));

    if (!inv) {
      return reply.status(404).send({ error: 'Not Found', message: 'Invitation token is invalid or does not exist' });
    }

    if (inv.status !== 'pending') {
      return reply.status(400).send({ error: 'Bad Request', message: `Invitation cannot be accepted (current status: ${inv.status})` });
    }

    if (new Date() > new Date(inv.expiresAt)) {
      await db.update(invitation).set({ status: 'expired', updatedAt: new Date() }).where(eq(invitation.id, inv.id));
      return reply.status(400).send({ error: 'Bad Request', message: 'Invitation has expired' });
    }

    if (await checkOrgSuspension(inv.organizationId)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Organization account is suspended' });
    }

    // STRICT INVITATION SECURITY RULE: Match authenticated user email with invited email
    if (session.user.email.trim().toLowerCase() !== inv.email.trim().toLowerCase()) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Invitation was sent to "${inv.email}", but you are signed in as "${session.user.email}". Please sign in with the invited email address.`,
      });
    }

    // Atomic transaction inserting member & marking invitation accepted
    await db.transaction(async (tx) => {
      // Check if user is already a member
      const [existingMem] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, inv.organizationId), eq(member.userId, session.user.id)));

      if (!existingMem) {
        await tx.insert(member).values({
          id: `mem_${randomUUID()}`,
          organizationId: inv.organizationId,
          userId: session.user.id,
          role: inv.role || 'member',
        });
      }

      // Attach initial project assignments if specified in invitation
      const initialProjectIds = (inv.projectIds as string[]) || [];
      if (initialProjectIds.length > 0) {
        for (const prjId of initialProjectIds) {
          await tx
            .insert(projectMembers)
            .values({
              id: `pm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              projectId: prjId,
              userId: session.user.id,
              role: inv.role === 'admin' ? 'admin' : 'member',
            })
            .onConflictDoNothing();
        }
      }

      await tx
        .update(invitation)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invitation.id, inv.id));

      // Audit log
      await tx.insert(auditLogs).values({
        id: `aud_${randomUUID()}`,
        organizationId: inv.organizationId,
        actorType: 'user',
        actorId: session.user.id,
        action: 'organization.invitation_accepted',
        severity: 'info',
        resourceType: 'invitation',
        resourceId: inv.id,
        metadata: { email: inv.email, role: inv.role },
      });
    });

    return reply.send({
      success: true,
      message: 'Invitation accepted successfully',
      organizationId: inv.organizationId,
    });
  });

  // POST /api/invitations/:token/decline (Decline Invitation)
  fastify.post<{
    Params: { token: string };
  }>('/api/invitations/:token/decline', async (request, reply) => {
    const { token } = request.params;
    const tokenHash = hashInvitationToken(token);

    const [inv] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash));

    if (!inv) {
      return reply.status(404).send({ error: 'Not Found', message: 'Invitation token is invalid' });
    }

    if (inv.status !== 'pending') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invitation is not pending' });
    }

    await db
      .update(invitation)
      .set({
        status: 'declined',
        updatedAt: new Date(),
      })
      .where(eq(invitation.id, inv.id));

    // Audit log
    await db.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      organizationId: inv.organizationId,
      actorType: 'system',
      actorId: 'invitation_system',
      action: 'organization.invitation_declined',
      severity: 'info',
      resourceType: 'invitation',
      resourceId: inv.id,
      metadata: { email: inv.email },
    });

    return reply.send({ success: true, message: 'Invitation declined' });
  });
}
