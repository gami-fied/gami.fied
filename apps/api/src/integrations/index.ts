import crypto from 'crypto';
import { db, integrationDeliveries, integrations, IntegrationRecord } from '@gami/database';
import {
  buildDiscordEmbedFromTemplate,
  DEFAULT_DISCORD_TEMPLATES,
  DiscordEmbedTemplate,
  EVENT_PLACEHOLDERS,
  registry,
  validateDiscordEmbedTemplate,
} from '@gami/integrations';
import { encryptSecret } from '@gami/webhooks';
import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';
import { ServerConfigService } from '../services/server-config.service.js';

const createIntegrationSchema = z.object({
  name: z.string().min(1).max(128),
  provider: z.string().min(1).max(64),
  webhookUrl: z.string().url().optional(),
  enabledEvents: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  enabled: z.boolean().optional(),
  enabledEvents: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional(),
});

const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().optional(),
});

const embedTemplateSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  color: z.union([z.string(), z.number()]).optional(),
  authorName: z.string().max(256).optional(),
  footerText: z.string().max(2048).optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  fields: z.array(embedFieldSchema).max(25).optional(),
});

const updateTemplatesSchema = z.object({
  enabledEvents: z.array(z.string()).optional(),
  customTemplates: z.record(embedTemplateSchema).optional(),
});

function getActorDetails(authResult: Record<string, unknown>): {
  actorId: string;
  actorType: 'user' | 'system' | 'api_key';
} {
  const session = (authResult.session as { user?: { id: string } }) || null;
  const apiKey = (authResult.apiKey as { id: string }) || null;
  return {
    actorId: session?.user?.id || apiKey?.id || 'system',
    actorType: session ? 'user' : apiKey ? 'api_key' : 'system',
  };
}

/**
 * Redacts secret credentials from integration records before returning in API responses.
 */
export function redactIntegrationRecord(intg: IntegrationRecord) {
  const cfg = (intg.config as Record<string, unknown>) || {};
  return {
    id: intg.id,
    projectId: intg.projectId,
    provider: intg.provider,
    name: intg.name,
    status: intg.status,
    enabled: intg.enabled,
    lastTestedAt: intg.lastTestedAt,
    lastError: intg.lastError,
    createdAt: intg.createdAt,
    updatedAt: intg.updatedAt,
    config: {
      guildId: cfg.guildId || null,
      channelId: cfg.channelId || null,
      guildName: cfg.guildName || null,
      channelName: cfg.channelName || null,
      enabledEvents: (cfg.enabledEvents as string[]) || ['xp_awarded', 'achievement_unlocked', 'level_up', 'challenge_completed'],
      customTemplates: (cfg.customTemplates as Record<string, DiscordEmbedTemplate>) || {},
      configured: Boolean(cfg.encryptedWebhookUrl || cfg.encryptedToken || cfg.webhookUrl),
    },
  };
}

export async function integrationRoutes(fastify: FastifyInstance) {
  // 1. GET /api/projects/:projectId/integrations (List Project Integrations)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/integrations',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const rows = await db
        .select()
        .from(integrations)
        .where(eq(integrations.projectId, projectId))
        .orderBy(desc(integrations.createdAt));

      // Return redacted records
      return reply.send({
        integrations: rows.map(redactIntegrationRecord),
      });
    }
  );

  // 2. GET /api/projects/:projectId/integrations/:integrationId (Get Single Integration)
  fastify.get<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [intg] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!intg) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      return reply.send({ integration: redactIntegrationRecord(intg) });
    }
  );

  // 3. POST /api/projects/:projectId/integrations (Create Integration - Owner/Admin)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/integrations',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = createIntegrationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid integration parameters',
          details: parseResult.error.format(),
        });
      }

      const { name, provider, webhookUrl, enabledEvents, config } = parseResult.data;

      // Check global provider setting
      const integrationsConfig = await ServerConfigService.getIntegrationsConfig();
      if (!integrationsConfig.enabled) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'External integrations are globally disabled by platform administrator',
        });
      }

      if (provider === 'discord' && !integrationsConfig.allowDiscordIntegration) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Discord integration is globally disabled by platform administrator',
        });
      }

      const integrationId = `intg_${crypto.randomUUID()}`;
      const finalConfig: Record<string, unknown> = {
        ...config,
        enabledEvents: enabledEvents || [
          'xp_awarded',
          'achievement_unlocked',
          'level_up',
          'challenge_completed',
        ],
        customTemplates: {},
      };

      if (webhookUrl) {
        finalConfig.encryptedWebhookUrl = encryptSecret(webhookUrl);
      }

      const [inserted] = await db
        .insert(integrations)
        .values({
          id: integrationId,
          projectId,
          provider: provider.toLowerCase(),
          name,
          status: 'active',
          enabled: true,
          config: finalConfig,
        })
        .returning();

      if (!inserted) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to create integration' });
      }

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.created',
        severity: 'info',
        resourceType: 'integration',
        resourceId: inserted.id,
        metadata: { provider: inserted.provider, name: inserted.name },
      });

      return reply.status(201).send({ integration: redactIntegrationRecord(inserted) });
    }
  );

  // 4. PATCH /api/projects/:projectId/integrations/:integrationId (Update Integration - Owner/Admin)
  fastify.patch<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = updateIntegrationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid update payload',
        });
      }

      const [existing] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const { name, enabled, enabledEvents, webhookUrl } = parseResult.data;
      const currentConfig = (existing.config as Record<string, unknown>) || {};
      const updatedConfig: Record<string, unknown> = {
        ...currentConfig,
      };

      if (enabledEvents) updatedConfig.enabledEvents = enabledEvents;
      if (webhookUrl) updatedConfig.encryptedWebhookUrl = encryptSecret(webhookUrl);

      const [updated] = await db
        .update(integrations)
        .set({
          name: name !== undefined ? name : existing.name,
          enabled: enabled !== undefined ? enabled : existing.enabled,
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integrationId))
        .returning();

      if (!updated) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to update integration' });
      }

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.updated',
        severity: 'info',
        resourceType: 'integration',
        resourceId: updated.id,
        metadata: { provider: updated.provider, name: updated.name, enabled: updated.enabled },
      });

      return reply.send({ integration: redactIntegrationRecord(updated) });
    }
  );

  // 5. DELETE /api/projects/:projectId/integrations/:integrationId (Delete Integration - Owner/Admin)
  fastify.delete<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [existing] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      await db.delete(integrations).where(eq(integrations.id, integrationId));

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.deleted',
        severity: 'info',
        resourceType: 'integration',
        resourceId: integrationId,
        metadata: { provider: existing.provider, name: existing.name },
      });

      return reply.send({ success: true, message: 'Integration deleted successfully' });
    }
  );

  // 6. POST /api/projects/:projectId/integrations/:integrationId/test (Send Test Notification)
  fastify.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/test',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [intg] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!intg) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const provider = registry.get(intg.provider);
      if (!provider) {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: `Provider "${intg.provider}" is not registered` });
      }

      const testResult = await provider.testConnection(intg.config as Record<string, unknown>);

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      if (testResult.success) {
        await db
          .update(integrations)
          .set({ lastTestedAt: new Date(), lastError: null, status: 'active', updatedAt: new Date() })
          .where(eq(integrations.id, integrationId));

        await createAuditLog(db, {
          projectId,
          actorType,
          actorId,
          action: 'integration.test_sent',
          severity: 'info',
          resourceType: 'integration',
          resourceId: integrationId,
          metadata: { success: true },
        });

        return reply.send({ success: true, message: 'Test notification sent successfully' });
      } else {
        await db
          .update(integrations)
          .set({ lastError: testResult.error, status: 'error', updatedAt: new Date() })
          .where(eq(integrations.id, integrationId));

        return reply.status(400).send({
          error: 'Integration Test Failed',
          message: testResult.error || 'Failed to deliver test message',
        });
      }
    }
  );

  // 7. POST /api/projects/:projectId/integrations/:integrationId/enable & disable
  fastify.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/enable',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [updated] = await db
        .update(integrations)
        .set({ enabled: true, status: 'active', updatedAt: new Date() })
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.enabled',
        severity: 'info',
        resourceType: 'integration',
        resourceId: integrationId,
      });

      return reply.send({ integration: redactIntegrationRecord(updated) });
    }
  );

  fastify.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/disable',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [updated] = await db
        .update(integrations)
        .set({ enabled: false, status: 'disabled', updatedAt: new Date() })
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.disabled',
        severity: 'info',
        resourceType: 'integration',
        resourceId: integrationId,
      });

      return reply.send({ integration: redactIntegrationRecord(updated) });
    }
  );

  // 8. GET /api/projects/:projectId/integrations/:integrationId/deliveries (List Deliveries - Owner/Admin)
  fastify.get<{
    Params: { projectId: string; integrationId: string };
    Querystring: { page?: string; limit?: string; status?: string };
  }>('/api/projects/:projectId/integrations/:integrationId/deliveries', async (request, reply) => {
    const { projectId, integrationId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(integrationDeliveries.integrationId, integrationId),
      eq(integrationDeliveries.projectId, projectId),
    ];
    if (request.query.status) {
      conditions.push(eq(integrationDeliveries.status, request.query.status));
    }

    const [totalRow] = await db
      .select({ count: count() })
      .from(integrationDeliveries)
      .where(and(...conditions));

    const totalCount = Number(totalRow?.count || 0);

    const rows = await db
      .select()
      .from(integrationDeliveries)
      .where(and(...conditions))
      .orderBy(desc(integrationDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      deliveries: rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  });

  // 9. POST /api/projects/:projectId/integrations/:integrationId/deliveries/:deliveryId/replay (Owner/Admin)
  fastify.post<{ Params: { projectId: string; integrationId: string; deliveryId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/deliveries/:deliveryId/replay',
    async (request, reply) => {
      const { projectId, integrationId, deliveryId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [existing] = await db
        .select()
        .from(integrationDeliveries)
        .where(
          and(
            eq(integrationDeliveries.id, deliveryId),
            eq(integrationDeliveries.integrationId, integrationId),
            eq(integrationDeliveries.projectId, projectId)
          )
        );

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Delivery record not found' });
      }

      // Replay resets status to 'pending', attempts to 0, availableAt to now, records replayedAt
      const [replayed] = await db
        .update(integrationDeliveries)
        .set({
          status: 'pending',
          attempts: 0,
          availableAt: new Date(),
          processingAt: null,
          completedAt: null,
          replayedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationDeliveries.id, deliveryId))
        .returning();

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.delivery_replayed',
        severity: 'info',
        resourceType: 'integration_delivery',
        resourceId: deliveryId,
        metadata: { integrationId },
      });

      return reply.send({ success: true, delivery: replayed });
    }
  );

  // 10. GET /api/projects/:projectId/integrations/:integrationId/templates (Get Custom & Default Templates)
  fastify.get<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/templates',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [intg] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!intg) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const cfg = (intg.config as Record<string, unknown>) || {};
      const enabledEvents = (cfg.enabledEvents as string[]) || [
        'xp_awarded',
        'achievement_unlocked',
        'level_up',
        'challenge_completed',
      ];
      const customTemplates = (cfg.customTemplates as Record<string, DiscordEmbedTemplate>) || {};

      return reply.send({
        enabledEvents,
        customTemplates,
        defaultTemplates: DEFAULT_DISCORD_TEMPLATES,
        placeholders: EVENT_PLACEHOLDERS,
      });
    }
  );

  // 11. PUT /api/projects/:projectId/integrations/:integrationId/templates (Update Custom Templates & Events)
  fastify.put<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/templates',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = updateTemplatesSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid template configuration payload',
          details: parseResult.error.format(),
        });
      }

      const [existing] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const { enabledEvents, customTemplates } = parseResult.data;

      // Validate all provided custom templates against Discord limits
      if (customTemplates) {
        for (const [evtType, tpl] of Object.entries(customTemplates)) {
          const valRes = validateDiscordEmbedTemplate(tpl);
          if (!valRes.valid) {
            return reply.status(400).send({
              error: 'Invalid Embed Template',
              message: `Validation failed for event type "${evtType}": ${valRes.errors.join('; ')}`,
              errors: valRes.errors,
            });
          }
        }
      }

      const currentConfig = (existing.config as Record<string, unknown>) || {};
      const updatedConfig: Record<string, unknown> = {
        ...currentConfig,
      };

      if (enabledEvents) updatedConfig.enabledEvents = enabledEvents;
      if (customTemplates) updatedConfig.customTemplates = customTemplates;

      const [updated] = await db
        .update(integrations)
        .set({
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integrationId))
        .returning();

      if (!updated) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to update templates' });
      }

      const { actorId, actorType } = getActorDetails(authResult as unknown as Record<string, unknown>);
      await createAuditLog(db, {
        projectId,
        actorType,
        actorId,
        action: 'integration.updated',
        severity: 'info',
        resourceType: 'integration',
        resourceId: updated.id,
        metadata: { action: 'templates_updated' },
      });

      return reply.send({ integration: redactIntegrationRecord(updated) });
    }
  );

  // 12. POST /api/projects/:projectId/integrations/:integrationId/templates/reset (Reset Templates to Defaults)
  fastify.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/templates/reset',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const { eventType } = (request.body as { eventType?: string }) || {};

      const [existing] = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.id, integrationId), eq(integrations.projectId, projectId)));

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'Integration not found' });
      }

      const currentConfig = (existing.config as Record<string, unknown>) || {};
      const customTemplates = { ...((currentConfig.customTemplates as Record<string, DiscordEmbedTemplate>) || {}) };

      if (eventType) {
        delete customTemplates[eventType];
      } else {
        // Reset all templates
        Object.keys(customTemplates).forEach((k) => delete customTemplates[k]);
      }

      const updatedConfig = {
        ...currentConfig,
        customTemplates,
      };

      const [updated] = await db
        .update(integrations)
        .set({
          config: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integrationId))
        .returning();

      if (!updated) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to reset templates' });
      }

      return reply.send({ success: true, integration: redactIntegrationRecord(updated) });
    }
  );

  // 13. POST /api/projects/:projectId/integrations/:integrationId/templates/preview (Render Live Embed Preview)
  fastify.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/templates/preview',
    async (request, reply) => {
      const { projectId, integrationId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const body = (request.body as { eventType: string; template?: DiscordEmbedTemplate }) || {};
      if (!body.eventType) {
        return reply.status(400).send({ error: 'Bad Request', message: 'eventType parameter is required' });
      }

      if (body.template) {
        const valRes = validateDiscordEmbedTemplate(body.template);
        if (!valRes.valid) {
          return reply.status(400).send({
            error: 'Invalid Embed Template',
            message: valRes.errors.join('; '),
            errors: valRes.errors,
          });
        }
      }

      const payload = buildDiscordEmbedFromTemplate(body.eventType, body.template);
      return reply.send({ payload });
    }
  );

  // 14. Discord OAuth Connect Helper
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/integrations/discord/connect',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const clientId = process.env.DISCORD_CLIENT_ID || '1234567890';
      const redirectUri = encodeURIComponent(
        process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/integrations/discord/callback'
      );
      const stateToken = crypto
        .createHmac('sha256', process.env.BETTER_AUTH_SECRET || 'secret')
        .update(`${projectId}:${Date.now()}`)
        .digest('hex');

      const state = `${projectId}:${stateToken}`;
      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=bot%20messages.read&permissions=2048&state=${state}`;

      return reply.send({ authUrl, state });
    }
  );
}
