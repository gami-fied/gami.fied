import crypto from 'crypto';
import { db, endUsers, eventOutbox, events } from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';
import { checkRateLimit } from '../middleware/rate-limiter.js';
import { authenticateApiKey } from '../services/api-key.service.js';

const eventIngestionSchema = z.object({
  event: z.string().min(1).max(128),
  user_id: z.string().max(128).optional(),
  payload: z.record(z.unknown()).default({}),
  occurred_at: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
  idempotency_key: z.string().max(128).optional(),
});

export async function eventRoutes(fastify: FastifyInstance) {
  // Public Event Ingestion Endpoint (Requires x-api-key)
  fastify.post('/v1/events', async (request, reply) => {
    // 64KB body size limit validation
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > 65536) {
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: 'Event payload exceeds maximum limit of 64KB',
      });
    }

    // Authenticate API Key
    const rawApiKey = request.headers['x-api-key'] as string;
    if (!rawApiKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing x-api-key authentication header',
      });
    }

    const authResult = await authenticateApiKey(rawApiKey);
    if (!authResult) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or revoked API key',
      });
    }

    const { project } = authResult;

    // Rate Limiting (Fail-Open)
    const isAllowed = await checkRateLimit(request, reply, project.id);
    if (!isAllowed) return;

    // Validate Request Body
    const parseResult = eventIngestionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid event request schema',
        details: parseResult.error.format(),
      });
    }

    const {
      event: eventType,
      user_id: externalUserId,
      payload,
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
    } = parseResult.data;

    // Verify Payload JSON Size
    if (JSON.stringify(payload).length > 65536) {
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: 'JSON payload size exceeds 64KB limit',
      });
    }

    // Concurrency-Safe End-User Resolution & Deactivation Check
    let internalUserId: string | null = null;
    if (externalUserId) {
      const [existingUser] = await db
        .select()
        .from(endUsers)
        .where(and(eq(endUsers.projectId, project.id), eq(endUsers.externalId, externalUserId)));

      if (existingUser) {
        if (!existingUser.active) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'User account is deactivated in this project',
          });
        }
        internalUserId = existingUser.id;
      } else {
        const newUserId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db
          .insert(endUsers)
          .values({
            id: newUserId,
            projectId: project.id,
            externalId: externalUserId,
            active: true,
          })
          .onConflictDoNothing();

        const [resolvedUser] = await db
          .select({ id: endUsers.id, active: endUsers.active })
          .from(endUsers)
          .where(and(eq(endUsers.projectId, project.id), eq(endUsers.externalId, externalUserId)));

        if (resolvedUser) {
          if (!resolvedUser.active) {
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'User account is deactivated in this project',
            });
          }
          internalUserId = resolvedUser.id;

          await createWebhookDelivery(db, {
            projectId: project.id,
            eventId: resolvedUser.id,
            eventType: 'user.created',
            userId: resolvedUser.id,
            data: { externalId: externalUserId },
          });
        }
      }
    }

    // Idempotent Event Record & Outbox Atomic Transaction
    const newEventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newOutboxId = `out_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      const result = await db.transaction(async (tx) => {
        if (idempotencyKey) {
          const [existing] = await tx
            .select()
            .from(events)
            .where(
              and(eq(events.projectId, project.id), eq(events.idempotencyKey, idempotencyKey))
            );

          if (existing) {
            return {
              id: existing.id,
              status: 'accepted',
              duplicate: true,
            };
          }
        }

        const [createdEvent] = await tx
          .insert(events)
          .values({
            id: newEventId,
            projectId: project.id,
            userId: internalUserId,
            type: eventType,
            payload,
            idempotencyKey: idempotencyKey || null,
            occurredAt,
          })
          .returning();

        if (!createdEvent) {
          throw new Error('Failed to insert event record');
        }

        await tx.insert(eventOutbox).values({
          id: newOutboxId,
          eventId: createdEvent.id,
          status: 'pending',
        });

        return {
          id: createdEvent.id,
          status: 'accepted',
          duplicate: false,
        };
      });

      return reply.status(202).send(result);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === '23505' && idempotencyKey) {
        const [existingEvent] = await db
          .select()
          .from(events)
          .where(and(eq(events.projectId, project.id), eq(events.idempotencyKey, idempotencyKey)));

        if (existingEvent) {
          return reply.status(202).send({
            id: existingEvent.id,
            status: 'accepted',
            duplicate: true,
          });
        }
      }
      throw err;
    }
  });

  // Dashboard Control Center: Authenticated Test Event Ingestion (Session Cookie Auth)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/events/test',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parseResult = eventIngestionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid event request schema',
          details: parseResult.error.format(),
        });
      }

      const {
        event: eventType,
        user_id: externalUserId,
        payload,
        occurred_at: occurredAt,
        idempotency_key: idempotencyKey,
      } = parseResult.data;

      let internalUserId: string | null = null;
      if (externalUserId) {
        const newUserId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db
          .insert(endUsers)
          .values({
            id: newUserId,
            projectId,
            externalId: externalUserId,
          })
          .onConflictDoNothing();

        const [resolvedUser] = await db
          .select({ id: endUsers.id })
          .from(endUsers)
          .where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, externalUserId)));

        internalUserId = resolvedUser?.id || null;
      }

      const newEventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const newOutboxId = `out_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      try {
        const result = await db.transaction(async (tx) => {
          if (idempotencyKey) {
            const [existing] = await tx
              .select()
              .from(events)
              .where(
                and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey))
              );

            if (existing) {
              return {
                id: existing.id,
                status: 'accepted',
                duplicate: true,
              };
            }
          }

          const [createdEvent] = await tx
            .insert(events)
            .values({
              id: newEventId,
              projectId,
              userId: internalUserId,
              type: eventType,
              payload,
              idempotencyKey: idempotencyKey || null,
              occurredAt,
            })
            .returning();

          if (!createdEvent) {
            throw new Error('Failed to insert event record');
          }

          await tx.insert(eventOutbox).values({
            id: newOutboxId,
            eventId: createdEvent.id,
            status: 'pending',
          });

          return {
            id: createdEvent.id,
            status: 'accepted',
            duplicate: false,
          };
        });

        return reply.status(202).send(result);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === '23505' && idempotencyKey) {
          const [existingEvent] = await db
            .select()
            .from(events)
            .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey)));

          if (existingEvent) {
            return reply.status(202).send({
              id: existingEvent.id,
              status: 'accepted',
              duplicate: true,
            });
          }
        }
        throw err;
      }
    }
  );

  // Dashboard: List Events for a Project (Paginated & Filtered)
  fastify.get<{
    Params: { projectId: string };
    Querystring: {
      page?: string;
      limit?: string;
      type?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    };
  }>('/api/projects/:projectId/events', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(events.projectId, projectId)];

    if (request.query.type) {
      conditions.push(eq(events.type, request.query.type));
    }
    if (request.query.userId) {
      conditions.push(eq(events.userId, request.query.userId));
    }
    if (request.query.startDate) {
      conditions.push(gte(events.occurredAt, new Date(request.query.startDate)));
    }
    if (request.query.endDate) {
      conditions.push(lte(events.occurredAt, new Date(request.query.endDate)));
    }

    const eventList = await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.occurredAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      data: eventList,
      pagination: {
        page,
        limit,
      },
    });
  });

  // Dashboard: Get Event Details (Tenant Isolated)
  fastify.get<{ Params: { projectId: string; eventId: string } }>(
    '/api/projects/:projectId/events/:eventId',
    async (request, reply) => {
      const { projectId, eventId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [evt] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.projectId, projectId)));

      if (!evt) {
        return reply.status(404).send({ error: 'Not Found', message: 'Event not found' });
      }

      return reply.send(evt);
    }
  );

  // Dashboard: Replay Event (Owner/Admin)
  fastify.post<{ Params: { projectId: string; eventId: string } }>(
    '/api/projects/:projectId/events/:eventId/replay',
    async (request, reply) => {
      const { projectId, eventId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
        'owner',
        'admin',
      ]);
      if (!orgAuth) return;

      const [targetEvent] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.projectId, projectId)));

      if (!targetEvent) {
        return reply.status(404).send({ error: 'Not Found', message: 'Event not found' });
      }

      // Check existing outbox record for this event
      const [existingOutbox] = await db
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, eventId));

      let outboxId = existingOutbox?.id;

      if (existingOutbox && (existingOutbox.status === 'failed' || existingOutbox.status === 'processing')) {
        // Unprocessed/failed event -> reset status back to pending
        await db
          .update(eventOutbox)
          .set({
            status: 'pending',
            attempts: 0,
            availableAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(eventOutbox.id, existingOutbox.id));
      } else {
        // Processed event -> re-enqueue intent with unique outbox entry while preserving eventId lineage
        outboxId = `out_replay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db
          .insert(eventOutbox)
          .values({
            id: outboxId,
            eventId: targetEvent.id,
            status: 'pending',
            attempts: 0,
            availableAt: new Date(),
          })
          .onConflictDoNothing();
      }

      const { createAuditLog } = await import('../audit-logs/index.js');
      await createAuditLog(db, {
        projectId,
        actorType: 'user',
        actorId: authResult.membership.userId,
        action: 'event.replayed',
        resourceType: 'event',
        resourceId: eventId,
        metadata: {
          eventId,
          eventType: targetEvent.type,
          outboxId,
          replayedAt: new Date().toISOString(),
        },
      });

      return reply.send({
        message: `Event "${eventId}" queued for replay successfully. Side-effect idempotency guards remain active.`,
        eventId,
        outboxId,
        replayedAt: new Date().toISOString(),
      });
    }
  );
}
