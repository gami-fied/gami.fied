import { auth, db, member, projects } from '@gami/database';
import { eq, and } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
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

export async function requireOrgMember(
  request: FastifyRequest,
  reply: FastifyReply,
  organizationId: string
) {
  const session = await requireAuth(request, reply);
  if (!session) return null;

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

export async function requireProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string
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

  const [prj] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!prj) {
    reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    return null;
  }

  const membership = await getOrgMembership(session.user.id, prj.organizationId);
  if (!membership) {
    // Return 404 to avoid leaking project existence to unauthorized callers (IDOR defense)
    reply.status(404).send({ error: 'Not Found', message: 'Project not found' });
    return null;
  }

  return { session, project: prj, membership };
}
