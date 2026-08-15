import {
  challengeRewardOutbox,
  checkDatabaseHealth,
  db,
  eventOutbox,
  events,
  notificationOutbox,
  webhookOutbox,
} from '@gami/database';
import { checkRedisHealth, getBullMQQueueMetrics, getWorkerHeartbeatStatus } from '@gami/queue';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireOrgRole, requireProjectAccess } from '../authorization/index.js';
import { processMetrics } from './metrics-collector.js';

export async function systemObservabilityRoutes(fastify: FastifyInstance) {
  // Get System Health & Operational Metrics (Owner/Admin)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/system/metrics',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const orgAuth = await requireOrgRole(request, reply, authResult.project.organizationId, [
        'owner',
        'admin',
      ]);
      if (!orgAuth) return;

      const cutoff = new Date(Date.now() - 5 * 60 * 1000);

      // 1. Authoritative DB Outbox metrics queries (calculated directly from PostgreSQL)
      const [
        [eventPendingRow],
        [croPendingRow],
        [notifPendingRow],
        [whPendingRow],
        [staleEventsRow],
        [staleCroRow],
        [staleNotifRow],
        [staleWhRow],
      ] = await Promise.all([
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
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'pending'))),
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
          .from(webhookOutbox)
          .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'processing'), lte(webhookOutbox.processingAt, cutoff))),
      ]);

      const totalStaleProcessing =
        (staleEventsRow?.count || 0) +
        (staleCroRow?.count || 0) +
        (staleNotifRow?.count || 0) +
        (staleWhRow?.count || 0);

      // 2. Dependency Health & BullMQ queue state
      const [dbHealthy, redisHealthy, workerStatus, queueMetrics] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        getWorkerHeartbeatStatus(),
        getBullMQQueueMetrics(),
      ]);

      const processSnapshot = processMetrics.getSnapshot();

      return reply.send({
        projectId,
        timestamp: new Date().toISOString(),
        health: {
          api: 'healthy',
          postgres: dbHealthy ? 'healthy' : 'unhealthy',
          redis: redisHealthy ? 'healthy' : 'unhealthy',
          worker: workerStatus.status,
          workerAlive: workerStatus.alive,
          workerHeartbeat: workerStatus.heartbeat,
        },
        outbox: {
          eventOutboxPending: eventPendingRow?.count || 0,
          challengeRewardOutboxPending: croPendingRow?.count || 0,
          notificationOutboxPending: notifPendingRow?.count || 0,
          webhookOutboxPending: whPendingRow?.count || 0,
          staleProcessingRecords: totalStaleProcessing,
        },
        queue: queueMetrics,
        process: processSnapshot,
      });
    }
  );
}
