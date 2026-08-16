import { auth, db, member, organizations, projectMembers, projects, users, Member } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticateApiKey } from '../services/api-key.service.js';

export async function getSession(request: FastifyRequest) {
  const reqHeaders = new Headers();
  Object.entries(request.headers).forEach(([key, val]) => {
    if (val !== undefined) {
      if (Array.isArray(val)) {
        val.forEach((v) => reqHeaders.append(key, v));
      } else {
        reqHeaders.set(key, val);
      }
    }
  });

  return await auth.api.getSession({
    headers: reqHeaders,
  });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(request);
  if (!session || !session.user) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    return null;
  }
  return session;
}

export async function getOrgMembership(userId: string, organizationId: string) {
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
  return m || null;
}

export async function checkOrgSuspension(organizationId: string): Promise<boolean> {
  const [org] = await db
    .select({ status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return Boolean(org && org.status === 'suspended');
}

export async function requireOrgMember(
  request: FastifyRequest,
  reply: FastifyReply,
  organizationId: string
) {
  const session = await requireAuth(request, reply);
  if (!session) return null;

  if (await checkOrgSuspension(organizationId)) {
    reply.status(403).send({ error: 'Forbidden', message: 'Organization account is suspended' });
    return null;
  }

  const membership = await getOrgMembership(session.user.id, organizationId);
  if (!membership) {
    reply.status(403).send({ error: 'Forbidden', message: 'Access to organization denied' });
    return null;
  }

  return { session, membership };
}

export async function requireOrgRole(
  request: FastifyRequest,
  reply: FastifyReply,
  organizationId: string,
  allowedRoles: ('owner' | 'admin' | 'member')[]
) {
  const result = await requireOrgMember(request, reply, organizationId);
  if (!result) return null;

  if (!allowedRoles.includes(result.membership.role as 'owner' | 'admin' | 'member')) {
    reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    return null;
  }

  return result;
}

/**
 * Checks whether a user has access to a project.
 * Evaluates Platform Admin, Org Owner, Org Admin, and explicit Project Members.
 */
export async function checkUserProjectAccess(
  userId: string,
  projectId: string
): Promise<{ allowed: boolean; isSuspended?: boolean; membership?: Member | null; isPlatformAdmin?: boolean }> {
  const [prj] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!prj) return { allowed: false };

  const isSuspended = await checkOrgSuspension(prj.organizationId);
  if (isSuspended) return { allowed: false, isSuspended: true };

  // 1. Platform Admin -> Allowed
  const [u] = await db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId));
  if (u && u.isPlatformAdmin) {
    const membership = await getOrgMembership(userId, prj.organizationId);
    return { allowed: true, isPlatformAdmin: true, membership };
  }

  // 2. Org Membership
  const membership = await getOrgMembership(userId, prj.organizationId);
  if (!membership) return { allowed: false };

  // 3. Owners & Admins -> Allowed
  if (['owner', 'admin'].includes(membership.role)) {
    return { allowed: true, membership };
  }

  // 4. Regular Org Member -> Check project_members table
  const allProjectMembers = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));

  // If no explicit project members exist, or if user is assigned -> Allowed
  if (allProjectMembers.length === 0) {
    return { allowed: true, membership };
  }

  const isAssigned = allProjectMembers.some((pm) => pm.userId === userId);
  if (isAssigned) {
    return { allowed: true, membership };
  }

  return { allowed: false };
}

export async function requireProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  requiredScope?: string
) {
  // 1. Check API Key Header (x-api-key)
  const rawApiKey = request.headers['x-api-key'] as string | undefined;
  if (rawApiKey) {
    const authResult = await authenticateApiKey(rawApiKey);
    if (!authResult || authResult.project.id !== projectId) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or unauthorized API key for this project',
      });
      return null;
    }

    if (authResult.isSuspended) {
      reply.status(403).send({ error: 'Forbidden', message: 'Organization account is suspended' });
      return null;
    }

    // Check scope if specified
    const keyScopes = (authResult.key.scopes as string[]) || ['*'];
    if (
      requiredScope &&
      !keyScopes.includes('*') &&
      !keyScopes.includes('full') &&
      !keyScopes.includes(requiredScope)
    ) {
      reply.status(403).send({
        error: 'Forbidden',
        message: `API key lacks required scope "${requiredScope}"`,
      });
      return null;
    }

    return {
      session: null,
      project: authResult.project,
      membership: {
        id: `m_apikey_${authResult.key.id}`,
        userId: `key_${authResult.key.id}`,
        organizationId: authResult.project.organizationId,
        role: 'admin' as const,
        createdAt: authResult.key.createdAt,
      },
    };
  }

  // 2. Fallback to User Session Cookie Auth
  const session = await requireAuth(request, reply);
  if (!session) return null;

  const access = await checkUserProjectAccess(session.user.id, projectId);
  if (access.isSuspended) {
    reply.status(403).send({ error: 'Forbidden', message: 'Organization account is suspended' });
    return null;
  }

  if (!access.allowed) {
    // Return 404 to avoid leaking project existence (IDOR defense)
    reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    return null;
  }

  const [prj] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!prj) {
    reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    return null;
  }

  return {
    session,
    project: prj,
    membership: access.membership || {
      id: `m_${session.user.id}`,
      organizationId: prj.organizationId,
      userId: session.user.id,
      role: access.isPlatformAdmin ? 'owner' : 'member',
      createdAt: new Date(),
    },
  };
}

/**
 * Requires an authenticated session with isPlatformAdmin === true.
 * Rejects project API keys and non-platform admin users with 403 Forbidden.
 */
export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers['x-api-key']) {
    reply.status(403).send({
      error: 'Forbidden',
      message: 'API keys cannot access platform administrator endpoints',
    });
    return null;
  }

  const session = await getSession(request);
  if (!session || !session.user) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    return null;
  }

  const [dbUser] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, session.user.id));

  if (!dbUser || !dbUser.isPlatformAdmin) {
    reply.status(403).send({
      error: 'Forbidden',
      message: 'Platform administrator authorization required',
    });
    return null;
  }

  return { session, isPlatformAdmin: true };
}
