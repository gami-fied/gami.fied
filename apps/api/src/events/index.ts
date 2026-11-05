import crypto from 'crypto';
import { db, eventOutbox, events } from '@gami/database';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { hasScope } from '../authorization/permissions.js';
import { checkRateLimit } from '../middleware/rate-limiter.js';
import { authenticateApiKey } from '../services/api-key.service.js';
import { ingestEvent } from '../services/event-ingestion.js';

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

const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((value) => Math.min(value, 100)),
  type: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const IDEMPOTENCY_MISMATCH_MESSAGE =
  'The Idempotency-Key has already been used with a different request payload.';
const USER_DEACTIVATED_MESSAGE = 'User account is deactivated in this project';

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

    const reqId = (request as unknown as { requestId?: string }).requestId || 'req_event_ingest';

    // Authenticate API Key
    const rawApiKey = request.headers['x-api-key'] as string;
    if (!rawApiKey) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing x-api-key authentication header',
          requestId: reqId,
        },
        message: 'Missing x-api-key authentication header',
        code: 'UNAUTHORIZED',
      });
    }

    const authResult = await authenticateApiKey(rawApiKey);
    if (!authResult) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or revoked API key',
          requestId: reqId,
        },
        message: 'Invalid or revoked API key',
        code: 'UNAUTHORIZED',
      });
    }

    if (authResult.isSuspended) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Organization account is suspended',
          requestId: reqId,
        },
        message: 'Organization account is suspended',
        code: 'FORBIDDEN',
      });
    }

    if (!hasScope((authResult.key.scopes as string[]) ?? [], 'events:write')) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'API key lacks required scope "events:write"',
          requestId: reqId,
        },
        message: 'API key lacks required scope "events:write"',
        code: 'FORBIDDEN',
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
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid event request schema',
          details: parseResult.error.format(),
        },
        message: 'Invalid event request schema',
        code: 'BAD_REQUEST',
        details: parseResult.error.format(),
      });
    }

    const headerIdempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const {
      event: eventType,
      user_id: externalUserId,
      payload,
      occurred_at: occurredAt,
      idempotency_key: bodyIdempotencyKey,
    } = parseResult.data;

    const rawKey = headerIdempotencyKey || bodyIdempotencyKey;
    const idempotencyKey = rawKey ? rawKey.trim() : undefined;

    if (idempotencyKey !== undefined) {
      if (idempotencyKey.length === 0 || idempotencyKey.length > 128) {
        return reply.status(400).send({
          error: {
            code: 'BAD_REQUEST',
            message: 'Idempotency-Key must be between 1 and 128 characters',
          },
          message: 'Idempotency-Key must be between 1 and 128 characters',
          code: 'BAD_REQUEST',
        });
      }
    }

    // Verify Payload JSON Size
    if (JSON.stringify(payload).length > 65536) {
      return reply.status(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'JSON payload size exceeds 64KB limit',
        },
        message: 'JSON payload size exceeds 64KB limit',
        code: 'PAYLOAD_TOO_LARGE',
      });
    }

    const result = await ingestEvent({
      projectId: project.id,
      eventType,
      externalUserId,
      payload,
      occurredAt,
      idempotencyKey,
    });

    if (result.outcome === 'idempotency_mismatch') {
      return reply.status(409).send({
        error: { code: 'IDEMPOTENCY_KEY_MISMATCH', message: IDEMPOTENCY_MISMATCH_MESSAGE },
        message: IDEMPOTENCY_MISMATCH_MESSAGE,
        code: 'IDEMPOTENCY_KEY_MISMATCH',
      });
    }

    if (result.outcome === 'user_deactivated') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: USER_DEACTIVATED_MESSAGE },
        message: USER_DEACTIVATED_MESSAGE,
        code: 'FORBIDDEN',
      });
    }

    return reply
      .status(202)
      .send({ id: result.id, status: 'accepted', duplicate: result.duplicate });
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

      const result = await ingestEvent({
        projectId,
        eventType,
        externalUserId,
        payload,
        occurredAt,
        idempotencyKey,
      });

      if (result.outcome === 'idempotency_mismatch') {
        return reply.status(409).send({
          error: 'Conflict',
          code: 'IDEMPOTENCY_KEY_MISMATCH',
          message: IDEMPOTENCY_MISMATCH_MESSAGE,
        });
      }

      if (result.outcome === 'user_deactivated') {
        return reply
          .status(403)
          .send({ error: 'Forbidden', code: 'FORBIDDEN', message: USER_DEACTIVATED_MESSAGE });
      }

      return reply
        .status(202)
        .send({ id: result.id, status: 'accepted', duplicate: result.duplicate });
    }
  );

  // Dashboard: List Events for a Project (Paginated & Filtered)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/events/dead-letter',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const failed = await db
        .select({
          eventId: events.id,
          type: events.type,
          occurredAt: events.occurredAt,
          attempts: eventOutbox.attempts,
          lastError: eventOutbox.lastError,
          failedAt: eventOutbox.updatedAt,
        })
        .from(eventOutbox)
        .innerJoin(events, eq(eventOutbox.eventId, events.id))
        .where(and(eq(events.projectId, projectId), eq(eventOutbox.status, 'failed')))
        .orderBy(desc(eventOutbox.updatedAt))
        .limit(100);

      return reply.send({ data: failed });
    }
  );

  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/events', async (request, reply) => {
    const { projectId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const query = listEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: query.error.format(),
      });
    }

    const { page, limit, type, userId, startDate, endDate } = query.data;
    const offset = (page - 1) * limit;

    const conditions = [eq(events.projectId, projectId)];

    if (type) conditions.push(eq(events.type, type));
    if (userId) conditions.push(eq(events.userId, userId));
    if (startDate) conditions.push(gte(events.occurredAt, startDate));
    if (endDate) conditions.push(lte(events.occurredAt, endDate));

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


      const [targetEvent] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.projectId, projectId)));

      if (!targetEvent) {
        return reply.status(404).send({ error: 'Not Found', message: 'Event not found' });
      }

      // Replay runs whatever has not completed: failed rules, rules added since, and rules that
      // did not match before. Completed rules never run twice, so XP cannot be awarded again.
      const replayId = `rpl_${crypto.randomBytes(8).toString('hex')}`;
      const [outbox] = await db
        .insert(eventOutbox)
        .values({
          id: `out_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          eventId: targetEvent.id,
          status: 'pending',
          replayId,
        })
        .onConflictDoUpdate({
          target: eventOutbox.eventId,
          set: {
            status: 'pending',
            attempts: 0,
            availableAt: sql`now()`,
            publishedAt: null,
            lastError: null,
            replayId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: eventOutbox.id });
      const outboxId = outbox?.id;

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
          replayId,
          replayedAt: new Date().toISOString(),
        },
      });

      return reply.send({
        message: `Event "${eventId}" queued for replay. Rules that already completed will not run again.`,
        eventId,
        outboxId,
        replayId,
        replayedAt: new Date().toISOString(),
      });
    }
  );
}
