import {
  checkDatabaseHealth,
  db,
  emailNotificationOutbox,
  endUsers,
  eventOutbox,
  events,
  notificationOutbox,
  organizations,
  projects,
  webhookOutbox,
} from '@gami/database';
import { checkRedisHealth, getBullMQQueueMetrics, getWorkerHeartbeatStatus } from '@gami/queue';
import { count, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';

export async function adminSystemRoutes(fastify: FastifyInstance) {
  fastify.get('/api/admin/system', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const [
      dbHealthy,
      redisHealthy,
      workerStatus,
      queueMetrics,
      [orgCountRow],
      [projectCountRow],
      [userCountRow],
      [eventCountRow],
      [eventPendingRow],
      [emailPendingRow],
      [notifPendingRow],
      [webhookPendingRow],
    ] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      getWorkerHeartbeatStatus(),
      getBullMQQueueMetrics(),
      db.select({ count: count() }).from(organizations),
      db.select({ count: count() }).from(projects),
      db.select({ count: count() }).from(endUsers),
      db.select({ count: count() }).from(events),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventOutbox)
        .where(eq(eventOutbox.status, 'pending')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailNotificationOutbox)
        .where(eq(emailNotificationOutbox.status, 'pending')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.status, 'pending')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookOutbox)
        .where(eq(webhookOutbox.status, 'pending')),
    ]);

    return reply.send({
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      health: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        worker: workerStatus.status,
        workerAlive: workerStatus.alive,
        workerHeartbeat: workerStatus.heartbeat,
      },
      counts: {
        organizations: orgCountRow?.count || 0,
        projects: projectCountRow?.count || 0,
        endUsers: userCountRow?.count || 0,
        eventsIngested: eventCountRow?.count || 0,
      },
      outboxes: {
        eventPending: eventPendingRow?.count || 0,
        emailPending: emailPendingRow?.count || 0,
        notificationPending: notifPendingRow?.count || 0,
        webhookPending: webhookPendingRow?.count || 0,
      },
      queue: queueMetrics,
    });
  });
}
