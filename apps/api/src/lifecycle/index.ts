import crypto from 'crypto';
import { db, endUsers, lifecycleCampaigns, lifecycleSends } from '@gami/database';
import {
  LIFECYCLE_DEFAULTS,
  LIFECYCLE_KINDS,
  LIFECYCLE_VARIABLES,
  renderLifecycleEmail,
  sampleValues,
  validateLifecycleConfig,
  validateLifecycleTemplate,
  type LifecycleKind,
} from '@gami/notifications';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const kindSchema = z.enum(['streak_reminder', 'weekly_recap', 'winback']);

const createSchema = z.object({
  kind: kindSchema,
  name: z.string().min(1).max(128),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10_000),
  config: z.unknown().optional(),
  enabled: z.boolean().default(false),
});

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(10_000).optional(),
  config: z.unknown().optional(),
  enabled: z.boolean().optional(),
});

const previewSchema = z.object({
  kind: kindSchema,
  subject: z.string().max(500),
  body: z.string().max(10_000),
});

function invalid(reply: FastifyReply, errors: string[]) {
  return reply.status(400).send({ error: 'Bad Request', message: errors[0], errors });
}

export async function lifecycleRoutes(fastify: FastifyInstance) {
  // The starting text and the variables each kind of email can use, for the editor.
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/campaigns/templates', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;

    return reply.send({
      data: LIFECYCLE_KINDS.map((kind) => ({
        kind,
        defaults: LIFECYCLE_DEFAULTS[kind],
        variables: LIFECYCLE_VARIABLES[kind],
      })),
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/campaigns/preview', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;

    const parsed = previewSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, ['Invalid preview request']);
    const { kind, subject, body } = parsed.data;

    const errors = validateLifecycleTemplate(kind, subject, body);
    if (errors.length > 0) return invalid(reply, errors);

    const rendered = renderLifecycleEmail({ subject, body }, sampleValues(kind));
    return reply.send(rendered);
  });

  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/campaigns', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;

    const since = new Date(Date.now() - 7 * 86_400_000);
    const [campaigns, counts] = await Promise.all([
      db
        .select()
        .from(lifecycleCampaigns)
        .where(eq(lifecycleCampaigns.projectId, projectId))
        .orderBy(lifecycleCampaigns.createdAt, lifecycleCampaigns.id),
      db
        .select({
          campaignId: lifecycleSends.campaignId,
          lastWeek: sql<number>`COUNT(*) FILTER (WHERE ${lifecycleSends.createdAt} >= ${since.toISOString()}::timestamptz)::int`,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(lifecycleSends)
        .where(eq(lifecycleSends.projectId, projectId))
        .groupBy(lifecycleSends.campaignId),
    ]);

    const byCampaign = new Map(counts.map((row) => [row.campaignId, row]));
    return reply.send({
      data: campaigns.map((campaign) => ({
        ...campaign,
        sentLastWeek: byCampaign.get(campaign.id)?.lastWeek ?? 0,
        sentTotal: byCampaign.get(campaign.id)?.total ?? 0,
      })),
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/campaigns', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, ['Invalid campaign']);
    const { kind, name, subject, body, enabled } = parsed.data;

    const errors = validateLifecycleTemplate(kind, subject, body);
    if (errors.length > 0) return invalid(reply, errors);
    const config = validateLifecycleConfig(kind, parsed.data.config ?? LIFECYCLE_DEFAULTS[kind].config);
    if ('error' in config) return invalid(reply, [config.error]);

    const [created] = await db
      .insert(lifecycleCampaigns)
      .values({
        id: `lcp_${crypto.randomUUID()}`,
        projectId,
        name,
        kind,
        enabled,
        subject,
        body,
        config: config.config,
      })
      .returning();
    return reply.status(201).send(created);
  });

  fastify.patch<{ Params: { projectId: string; campaignId: string } }>(
    '/api/projects/:projectId/campaigns/:campaignId',
    async (request, reply) => {
      const { projectId, campaignId } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) return invalid(reply, ['Invalid campaign']);

      const [existing] = await db
        .select()
        .from(lifecycleCampaigns)
        .where(and(eq(lifecycleCampaigns.id, campaignId), eq(lifecycleCampaigns.projectId, projectId)));
      if (!existing) return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });

      const kind = existing.kind as LifecycleKind;
      const subject = parsed.data.subject ?? existing.subject;
      const body = parsed.data.body ?? existing.body;
      const errors = validateLifecycleTemplate(kind, subject, body);
      if (errors.length > 0) return invalid(reply, errors);

      let config = existing.config;
      if (parsed.data.config !== undefined) {
        const checked = validateLifecycleConfig(kind, parsed.data.config);
        if ('error' in checked) return invalid(reply, [checked.error]);
        config = checked.config;
      }

      const [updated] = await db
        .update(lifecycleCampaigns)
        .set({
          name: parsed.data.name ?? existing.name,
          subject,
          body,
          config,
          enabled: parsed.data.enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(lifecycleCampaigns.id, campaignId))
        .returning();
      return reply.send(updated);
    }
  );

  fastify.delete<{ Params: { projectId: string; campaignId: string } }>(
    '/api/projects/:projectId/campaigns/:campaignId',
    async (request, reply) => {
      const { projectId, campaignId } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;

      const [deleted] = await db
        .delete(lifecycleCampaigns)
        .where(and(eq(lifecycleCampaigns.id, campaignId), eq(lifecycleCampaigns.projectId, projectId)))
        .returning({ id: lifecycleCampaigns.id });
      if (!deleted) return reply.status(404).send({ error: 'Not Found', message: 'Campaign not found' });
      return reply.status(204).send();
    }
  );

  fastify.get<{ Params: { projectId: string; campaignId: string }; Querystring: { limit?: string } }>(
    '/api/projects/:projectId/campaigns/:campaignId/sends',
    async (request, reply) => {
      const { projectId, campaignId } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;

      const limit = Math.min(Math.max(Number(request.query.limit) || 25, 1), 100);
      const data = await db
        .select({
          id: lifecycleSends.id,
          userId: lifecycleSends.userId,
          externalId: endUsers.externalId,
          name: endUsers.name,
          periodKey: lifecycleSends.periodKey,
          createdAt: lifecycleSends.createdAt,
        })
        .from(lifecycleSends)
        .innerJoin(endUsers, eq(endUsers.id, lifecycleSends.userId))
        .where(and(eq(lifecycleSends.projectId, projectId), eq(lifecycleSends.campaignId, campaignId), gte(lifecycleSends.createdAt, new Date(0))))
        .orderBy(desc(lifecycleSends.createdAt))
        .limit(limit);
      return reply.send({ data });
    }
  );
}
