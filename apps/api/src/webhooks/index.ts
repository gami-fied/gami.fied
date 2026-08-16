import crypto from 'crypto';
import { db, webhookEndpoints, webhookOutbox, webhookSubscriptions } from '@gami/database';
import {
  createWebhookDelivery,
  encryptSecret,
  generateWebhookSecret,
  SUPPORTED_WEBHOOK_EVENT_TYPES,
  validateWebhookUrl,
  type WebhookEventType,
} from '@gami/webhooks';
import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const webhookEventTypeEnum = z.enum([
  'xp.awarded',
  'achievement.unlocked',
  'level.up',
  'challenge.completed',
  'user.created',
  'user.deactivated',
  'webhook.test',
]);

const createWebhookSchema = z.object({
  name: z.string().min(1).max(128),
  url: z.string().url().max(512),
  description: z.string().max(256).optional().nullable(),
  events: z.array(webhookEventTypeEnum).min(1).max(20),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  url: z.string().url().max(512).optional(),
  description: z.string().max(256).optional().nullable(),
  active: z.boolean().optional(),
  events: z.array(webhookEventTypeEnum).min(1).max(20).optional(),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  // 1. POST /api/projects/:projectId/webhooks (Create endpoint - Owner/Admin)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/webhooks',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const parseResult = createWebhookSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid webhook configuration',
          details: parseResult.error.format(),
        });
      }

      const { name, url, description, events } = parseResult.data;

      // SSRF & URL Security Validation
      const urlCheck = await validateWebhookUrl(url);
      if (!urlCheck.valid) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: urlCheck.error || 'Invalid or insecure webhook URL',
        });
      }

      const rawSecret = generateWebhookSecret();
      const secretHash = encryptSecret(rawSecret);
      const endpointId = `whk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const [newEndpoint] = await db
        .insert(webhookEndpoints)
        .values({
          id: endpointId,
          projectId,
          name,
          url,
          secretHash,
          active: true,
          description: description || null,
        })
        .returning();

      // Insert subscriptions
      for (const eventType of events) {
        await db.insert(webhookSubscriptions).values({
          id: `whs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          endpointId,
          eventType,
        });
      }

      if (!newEndpoint) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to create webhook endpoint' });
      }

      const { createAuditLog } = await import('../audit-logs/index.js');
      await createAuditLog(db, {
        projectId,
        actorType: 'user',
        actorId: authResult.membership?.userId || 'system',
        action: 'webhook.created',
        resourceType: 'webhook',
        resourceId: newEndpoint.id,
        metadata: { name: newEndpoint.name, url: newEndpoint.url, events },
      });

      return reply.status(201).send({
        id: newEndpoint.id,
        projectId: newEndpoint.projectId,
        name: newEndpoint.name,
        url: newEndpoint.url,
        description: newEndpoint.description,
        events,
        secret: rawSecret, // RETURNED ONLY ONCE
        active: newEndpoint.active,
        createdAt: newEndpoint.createdAt,
        updatedAt: newEndpoint.updatedAt,
      });
    }
  );

  // 2. GET /api/projects/:projectId/webhooks (List endpoints - Member+)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/webhooks',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const endpoints = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.projectId, projectId))
        .orderBy(desc(webhookEndpoints.createdAt));

      const responseList = [];

      for (const ep of endpoints) {
        const subs = await db
          .select({ eventType: webhookSubscriptions.eventType })
          .from(webhookSubscriptions)
          .where(eq(webhookSubscriptions.endpointId, ep.id));

        responseList.push({
          id: ep.id,
          projectId: ep.projectId,
          name: ep.name,
          url: ep.url,
          description: ep.description,
          active: ep.active,
          events: subs.map((s) => s.eventType as WebhookEventType),
          createdAt: ep.createdAt,
          updatedAt: ep.updatedAt,
          lastDeliveryAt: ep.lastDeliveryAt,
          failureCount: ep.failureCount,
        });
      }

      return reply.status(200).send(responseList);
    }
  );

  // 3. GET /api/projects/:projectId/webhooks/:webhookId (Get single endpoint - Member+)
  fastify.get<{ Params: { projectId: string; webhookId: string } }>(
    '/api/projects/:projectId/webhooks/:webhookId',
    async (request, reply) => {
      const { projectId, webhookId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      if (!ep) {
        return reply.status(404).send({ error: 'Not Found', message: 'Webhook endpoint not found' });
      }

      const subs = await db
        .select({ eventType: webhookSubscriptions.eventType })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.endpointId, ep.id));

      return reply.status(200).send({
        id: ep.id,
        projectId: ep.projectId,
        name: ep.name,
        url: ep.url,
        description: ep.description,
        active: ep.active,
        events: subs.map((s) => s.eventType as WebhookEventType),
        createdAt: ep.createdAt,
        updatedAt: ep.updatedAt,
        lastDeliveryAt: ep.lastDeliveryAt,
        failureCount: ep.failureCount,
      });
    }
  );

  // 4. PATCH /api/projects/:projectId/webhooks/:webhookId (Update endpoint - Owner/Admin)
  fastify.patch<{ Params: { projectId: string; webhookId: string } }>(
    '/api/projects/:projectId/webhooks/:webhookId',
    async (request, reply) => {
      const { projectId, webhookId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      if (!ep) {
        return reply.status(404).send({ error: 'Not Found', message: 'Webhook endpoint not found' });
      }

      const parseResult = updateWebhookSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid update payload',
          details: parseResult.error.format(),
        });
      }

      const { name, url, description, active, events } = parseResult.data;

      if (url && url !== ep.url) {
        const urlCheck = await validateWebhookUrl(url);
        if (!urlCheck.valid) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: urlCheck.error || 'Invalid or insecure webhook URL',
          });
        }
      }

      const updateData: Partial<typeof webhookEndpoints.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) updateData.name = name;
      if (url !== undefined) updateData.url = url;
      if (description !== undefined) updateData.description = description;
      if (active !== undefined) updateData.active = active;

      const [updated] = await db
        .update(webhookEndpoints)
        .set(updateData)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        )
        .returning();

      if (events) {
        await db
          .delete(webhookSubscriptions)
          .where(eq(webhookSubscriptions.endpointId, webhookId));

        for (const eventType of events) {
          await db.insert(webhookSubscriptions).values({
            id: `whs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            endpointId: webhookId,
            eventType,
          });
        }
      }

      if (!updated) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to update webhook endpoint' });
      }

      const subs = await db
        .select({ eventType: webhookSubscriptions.eventType })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.endpointId, webhookId));

      return reply.status(200).send({
        id: updated.id,
        projectId: updated.projectId,
        name: updated.name,
        url: updated.url,
        description: updated.description,
        active: updated.active,
        events: subs.map((s) => s.eventType as WebhookEventType),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        lastDeliveryAt: updated.lastDeliveryAt,
        failureCount: updated.failureCount,
      });
    }
  );

  // 5. DELETE /api/projects/:projectId/webhooks/:webhookId (Soft-deactivate endpoint - Owner/Admin)
  fastify.delete<{ Params: { projectId: string; webhookId: string } }>(
    '/api/projects/:projectId/webhooks/:webhookId',
    async (request, reply) => {
      const { projectId, webhookId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      if (!ep) {
        return reply.status(404).send({ error: 'Not Found', message: 'Webhook endpoint not found' });
      }

      await db
        .update(webhookEndpoints)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      return reply.status(200).send({
        success: true,
        message: 'Webhook endpoint deactivated successfully',
      });
    }
  );

  // 6. POST /api/projects/:projectId/webhooks/:webhookId/rotate-secret (Rotate Secret - Owner/Admin)
  fastify.post<{ Params: { projectId: string; webhookId: string } }>(
    '/api/projects/:projectId/webhooks/:webhookId/rotate-secret',
    async (request, reply) => {
      const { projectId, webhookId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      if (!ep) {
        return reply.status(404).send({ error: 'Not Found', message: 'Webhook endpoint not found' });
      }

      const newRawSecret = generateWebhookSecret();
      const newSecretHash = encryptSecret(newRawSecret);

      await db
        .update(webhookEndpoints)
        .set({
          secretHash: newSecretHash,
          updatedAt: new Date(),
        })
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      return reply.status(200).send({
        id: webhookId,
        secret: newRawSecret, // RETURNED ONLY ONCE
        message: 'Webhook secret rotated successfully',
      });
    }
  );

  // 7. POST /api/projects/:projectId/webhooks/:webhookId/test (Queue test delivery - Owner/Admin)
  fastify.post<{ Params: { projectId: string; webhookId: string } }>(
    '/api/projects/:projectId/webhooks/:webhookId/test',
    async (request, reply) => {
      const { projectId, webhookId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, webhookId), eq(webhookEndpoints.projectId, projectId))
        );

      if (!ep) {
        return reply.status(404).send({ error: 'Not Found', message: 'Webhook endpoint not found' });
      }

      const testEventId = `evt_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Temporarily insert webhook.test subscription if not present so test delivery is queued
      await db
        .insert(webhookSubscriptions)
        .values({
          id: `whs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          endpointId: webhookId,
          eventType: 'webhook.test',
        })
        .onConflictDoNothing();

      const createdCount = await createWebhookDelivery(db, {
        projectId,
        eventId: testEventId,
        eventType: 'webhook.test',
        data: {
          test: true,
          message: 'Gami webhook test payload',
          timestamp: new Date().toISOString(),
        },
      });

      return reply.status(202).send({
        success: true,
        message: 'Test webhook delivery queued successfully',
        deliveriesQueued: createdCount,
      });
    }
  );

  // 8. GET /api/projects/:projectId/webhooks/:webhookId/deliveries (List delivery history - Owner/Admin)
  fastify.get<{
    Params: { projectId: string; webhookId: string };
    Querystring: { page?: string; limit?: string; status?: string; eventType?: string };
  }>('/api/projects/:projectId/webhooks/:webhookId/deliveries', async (request, reply) => {
    const { projectId, webhookId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
    }

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '25', 10)));
    const offset = (page - 1) * limit;

    const statusFilter = request.query.status;
    const eventTypeFilter = request.query.eventType;

    const conditions = [
      eq(webhookOutbox.endpointId, webhookId),
      eq(webhookOutbox.projectId, projectId),
    ];

    if (statusFilter) {
      conditions.push(eq(webhookOutbox.status, statusFilter));
    }
    if (eventTypeFilter) {
      conditions.push(eq(webhookOutbox.eventType, eventTypeFilter));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ total: count() })
      .from(webhookOutbox)
      .where(whereClause);

    const total = countResult?.total || 0;

    const deliveries = await db
      .select({
        id: webhookOutbox.id,
        endpointId: webhookOutbox.endpointId,
        eventId: webhookOutbox.eventId,
        eventType: webhookOutbox.eventType,
        status: webhookOutbox.status,
        attempts: webhookOutbox.attempts,
        availableAt: webhookOutbox.availableAt,
        deliveredAt: webhookOutbox.deliveredAt,
        lastError: webhookOutbox.lastError,
        createdAt: webhookOutbox.createdAt,
      })
      .from(webhookOutbox)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(webhookOutbox.createdAt));

    return reply.status(200).send({
      page,
      limit,
      total,
      deliveries,
    });
  });

  // 9. POST /api/projects/:projectId/webhooks/:webhookId/deliveries/:deliveryId/replay (Replay delivery - Owner/Admin)
  fastify.post<{
    Params: { projectId: string; webhookId: string; deliveryId: string };
  }>(
    '/api/projects/:projectId/webhooks/:webhookId/deliveries/:deliveryId/replay',
    async (request, reply) => {
      const { projectId, webhookId, deliveryId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (authResult.membership && !['owner', 'admin'].includes(authResult.membership.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [targetDelivery] = await db
        .select()
        .from(webhookOutbox)
        .where(
          and(
            eq(webhookOutbox.id, deliveryId),
            eq(webhookOutbox.endpointId, webhookId),
            eq(webhookOutbox.projectId, projectId)
          )
        );

      if (!targetDelivery) {
        return reply.status(404).send({ error: 'Not Found', message: 'Delivery record not found' });
      }

      const newDeliveryId = `who_replay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date();

      const [replayed] = await db
        .insert(webhookOutbox)
        .values({
          id: newDeliveryId,
          projectId,
          endpointId: webhookId,
          eventType: targetDelivery.eventType,
          eventId: `${targetDelivery.eventId}_r${Date.now()}`,
          payload: targetDelivery.payload,
          status: 'pending',
          attempts: 0,
          availableAt: now,
        })
        .returning();

      if (!replayed) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to replay delivery' });
      }

      return reply.status(202).send({
        success: true,
        message: 'Webhook delivery replayed successfully',
        newDeliveryId: replayed.id,
      });
    }
  );
}
