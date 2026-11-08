import { db } from '@gami/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';
import { actorOf } from '../rules/versions.js';
import { diffProjects, promote, PROMOTABLE_KINDS, type PromotableKind } from './promotion.js';

/** Both projects must be in one organization, and the caller must be an admin of both. */
async function bothProjects(request: FastifyRequest, reply: FastifyReply, sourceId: string, targetId: string | null | undefined) {
  const source = await requireProjectAccess(request, reply, sourceId);
  if (!source) return null;
  const target = targetId ?? source.project.promotesToProjectId;
  if (!target) {
    reply.status(400).send({ error: 'Bad Request', message: 'Choose a project to promote to, or set one in the project settings' });
    return null;
  }
  if (target === sourceId) {
    reply.status(400).send({ error: 'Bad Request', message: 'A project cannot promote to itself' });
    return null;
  }
  const destination = await requireProjectAccess(request, reply, target);
  if (!destination) return null;
  if (destination.project.organizationId !== source.project.organizationId) {
    reply.status(400).send({ error: 'Bad Request', message: 'Both projects must be in the same organization' });
    return null;
  }
  return { source, destination, targetId: target };
}

const isAdmin = (auth: { membership: { role: string } }) => ['owner', 'admin'].includes(auth.membership.role);

export async function environmentRoutes(fastify: FastifyInstance) {
  // A preview: what promoting this project's design would add or change in the target.
  fastify.get<{ Params: { projectId: string }; Querystring: { target?: string } }>('/api/projects/:projectId/promotion', async (request, reply) => {
    const pair = await bothProjects(request, reply, request.params.projectId, request.query.target);
    if (!pair) return;
    const items = await diffProjects(request.params.projectId, pair.targetId);
    return reply.send({
      source: { id: pair.source.project.id, name: pair.source.project.name, environment: pair.source.project.environment },
      target: { id: pair.destination.project.id, name: pair.destination.project.name, environment: pair.destination.project.environment },
      summary: {
        new: items.filter((item) => item.status === 'new').length,
        changed: items.filter((item) => item.status === 'changed').length,
        same: items.filter((item) => item.status === 'same').length,
        onlyInTarget: items.filter((item) => item.status === 'only_in_target').length,
      },
      data: items,
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/promotion', async (request, reply) => {
    const parsed = z
      .object({
        targetProjectId: z.string().min(1).max(128).optional(),
        /** Leave out to promote everything new or changed. */
        items: z.array(z.object({ kind: z.enum(PROMOTABLE_KINDS as unknown as [PromotableKind, ...PromotableKind[]]), identity: z.string().min(1).max(256) })).max(2000).optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid promotion' });

    const pair = await bothProjects(request, reply, request.params.projectId, parsed.data.targetProjectId);
    if (!pair) return;
    if (!isAdmin(pair.source) || !isAdmin(pair.destination)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only owners and admins of both projects can promote' });
    }

    try {
      const result = await promote(request.params.projectId, pair.targetId, parsed.data.items ?? null, actorOf(pair.source));
      await createAuditLog(db, {
        organizationId: pair.source.project.organizationId,
        projectId: pair.targetId,
        actorType: 'user',
        actorId: actorOf(pair.source) ?? 'unknown',
        action: 'project.promoted',
        severity: 'warning',
        resourceType: 'project',
        resourceId: pair.targetId,
        metadata: { from: request.params.projectId, ...result, items: parsed.data.items?.length ?? 'all' },
      });
      return reply.send(result);
    } catch (err) {
      return reply.status(409).send({ error: 'Conflict', message: (err as Error).message });
    }
  });
}

