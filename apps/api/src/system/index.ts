import {
  challengeRewardOutbox,
  db,
  emailNotificationOutbox,
  eventOutbox,
  events,
  integrationDeliveries,
  notificationOutbox,
  webhookOutbox,
} from '@gami/database';
import { and, count, eq, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

export async function systemObservabilityRoutes(fastify: FastifyInstance) {
  // Get Project Delivery Health & Operational Metrics (Project Scoped Only)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/system/metrics',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const cutoff = new Date(Date.now() - 5 * 60 * 1000);

      // Project-specific metrics queries ONLY (no global DB/Redis/Worker/HTTP stats)
      const [
        [eventCountRow],
        [eventPendingRow],
        [croPendingRow],
        [notifPendingRow],
        [emailPendingRow],
        [whPendingRow],
        [whDeliveredRow],
        [whFailedRow],
        [integDeliveredRow],
        [integFailedRow],
        [staleEventsRow],
        [staleCroRow],
        [staleNotifRow],
        [staleEmailRow],
        [staleWhRow],
      ] = await Promise.all([
        db.select({ count: count() }).from(events).where(eq(events.projectId, projectId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(eventOutbox)
          .innerJoin(events, eq(eventOutbox.eventId, events.id))
          .where(and(eq(events.projectId, projectId), eq(eventOutbox.status, 'pending'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(challengeRewardOutbox)
          .where(and(eq(challengeRewardOutbox.projectId, projectId), eq(challengeRewardOutbox.status, 'pending'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notificationOutbox)
          .where(and(eq(notificationOutbox.projectId, projectId), eq(notificationOutbox.status, 'pending'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailNotificationOutbox)
          .where(and(eq(emailNotificationOutbox.projectId, projectId), eq(emailNotificationOutbox.status, 'pending'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'pending'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'delivered'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'failed'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(integrationDeliveries)
          .where(and(eq(integrationDeliveries.projectId, projectId), eq(integrationDeliveries.status, 'delivered'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(integrationDeliveries)
          .where(and(eq(integrationDeliveries.projectId, projectId), eq(integrationDeliveries.status, 'failed'))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(eventOutbox)
          .innerJoin(events, eq(eventOutbox.eventId, events.id))
          .where(and(eq(events.projectId, projectId), eq(eventOutbox.status, 'processing'), lte(eventOutbox.updatedAt, cutoff))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(challengeRewardOutbox)
          .where(and(eq(challengeRewardOutbox.projectId, projectId), eq(challengeRewardOutbox.status, 'processing'), lte(challengeRewardOutbox.updatedAt, cutoff))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notificationOutbox)
          .where(and(eq(notificationOutbox.projectId, projectId), eq(notificationOutbox.status, 'processing'), lte(notificationOutbox.processingAt, cutoff))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailNotificationOutbox)
          .where(and(eq(emailNotificationOutbox.projectId, projectId), eq(emailNotificationOutbox.status, 'processing'), lte(emailNotificationOutbox.processingAt, cutoff))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'processing'), lte(webhookOutbox.processingAt, cutoff))),
      ]);

      const totalStaleProcessing =
        (staleEventsRow?.count || 0) +
        (staleCroRow?.count || 0) +
        (staleNotifRow?.count || 0) +
        (staleEmailRow?.count || 0) +
        (staleWhRow?.count || 0);

      return reply.send({
        projectId,
        projectName: authResult.project.name,
        timestamp: new Date().toISOString(),
        eventsIngested: eventCountRow?.count || 0,
        outbox: {
          eventOutboxPending: eventPendingRow?.count || 0,
          challengeRewardOutboxPending: croPendingRow?.count || 0,
          notificationOutboxPending: notifPendingRow?.count || 0,
          emailNotificationOutboxPending: emailPendingRow?.count || 0,
          webhookOutboxPending: whPendingRow?.count || 0,
          staleProcessingRecords: totalStaleProcessing,
        },
        webhookStats: {
          delivered: whDeliveredRow?.count || 0,
          failed: whFailedRow?.count || 0,
          pending: whPendingRow?.count || 0,
        },
        integrationStats: {
          delivered: integDeliveredRow?.count || 0,
          failed: integFailedRow?.count || 0,
        },
      });
    }
  );

  // Alias endpoint for Developer Portal API usage metrics
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/metrics',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [eventCountRow] = await db
        .select({ count: count() })
        .from(events)
        .where(eq(events.projectId, projectId));

      return reply.send({
        projectId,
        projectName: authResult.project.name,
        timestamp: new Date().toISOString(),
        eventsIngested: eventCountRow?.count || 0,
        requests: {
          received: eventCountRow?.count || 0,
          successful: eventCountRow?.count || 0,
          failed: 0,
          rateLimited: 0,
        },
      });
    }
  );
}
