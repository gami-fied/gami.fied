import {
  auditLogs,
  db,
  emailNotificationOutbox,
  eventOutbox,
  integrationDeliveries,
  ruleExecutions,
  webhookOutbox,
} from '@gami/database';
import { and, count, eq, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';

export async function adminStorageRoutes(fastify: FastifyInstance) {
  // 1. GET /api/admin/storage/metrics
  fastify.get('/api/admin/storage/metrics', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    try {
      // Query Database size if PostgreSQL
      let dbSizeBytes = 0;
      try {
        const [sizeRow] = await db.execute<{ size: string }>(
          sql`SELECT pg_database_size(current_database())::text as size`
        );
        if (sizeRow?.size) {
          dbSizeBytes = parseInt(sizeRow.size, 10);
        }
      } catch {
        dbSizeBytes = 0;
      }

      const [
        [whTotal],
        [whCompleted],
        [whFailed],
        [integTotal],
        [integDelivered],
        [integFailed],
        [emailTotal],
        [emailSent],
        [emailFailed],
        [eventOutboxTotal],
        [eventOutboxCompleted],
        [eventOutboxFailed],
        [ruleExecTotal],
        [auditTotal],
      ] = await Promise.all([
        db.select({ count: count() }).from(webhookOutbox),
        db.select({ count: count() }).from(webhookOutbox).where(eq(webhookOutbox.status, 'delivered')),
        db.select({ count: count() }).from(webhookOutbox).where(eq(webhookOutbox.status, 'failed')),
        db.select({ count: count() }).from(integrationDeliveries),
        db.select({ count: count() }).from(integrationDeliveries).where(eq(integrationDeliveries.status, 'delivered')),
        db.select({ count: count() }).from(integrationDeliveries).where(eq(integrationDeliveries.status, 'failed')),
        db.select({ count: count() }).from(emailNotificationOutbox),
        db.select({ count: count() }).from(emailNotificationOutbox).where(eq(emailNotificationOutbox.status, 'sent')),
        db.select({ count: count() }).from(emailNotificationOutbox).where(eq(emailNotificationOutbox.status, 'failed')),
        db.select({ count: count() }).from(eventOutbox),
        db.select({ count: count() }).from(eventOutbox).where(eq(eventOutbox.status, 'completed')),
        db.select({ count: count() }).from(eventOutbox).where(eq(eventOutbox.status, 'failed')),
        db.select({ count: count() }).from(ruleExecutions),
        db.select({ count: count() }).from(auditLogs),
      ]);

      const metrics = {
        databaseSizeBytes: dbSizeBytes,
        tables: {
          webhookOutbox: {
            id: 'webhook_outbox',
            name: 'Webhook Deliveries Log',
            description: 'Webhook payload delivery attempts, status, and failure history.',
            totalRows: whTotal?.count || 0,
            completedRows: whCompleted?.count || 0,
            failedRows: whFailed?.count || 0,
          },
          integrationDeliveries: {
            id: 'integration_deliveries',
            name: 'Integration Channel Deliveries Log',
            description: 'Discord and external integration channel webhook delivery attempts.',
            totalRows: integTotal?.count || 0,
            completedRows: integDelivered?.count || 0,
            failedRows: integFailed?.count || 0,
          },
          emailNotificationOutbox: {
            id: 'email_outbox',
            name: 'Email Outbox History',
            description: 'Transaction emails, invitation emails, and alert notification dispatches.',
            totalRows: emailTotal?.count || 0,
            completedRows: emailSent?.count || 0,
            failedRows: emailFailed?.count || 0,
          },
          eventOutbox: {
            name: 'Event Processing Outbox',
            id: 'event_outbox',
            description: 'Ingested raw event queues and rule engine processing history.',
            totalRows: eventOutboxTotal?.count || 0,
            completedRows: eventOutboxCompleted?.count || 0,
            failedRows: eventOutboxFailed?.count || 0,
          },
          ruleExecutions: {
            id: 'rule_executions',
            name: 'Rule Execution Logs',
            description: 'Detailed rule matching execution logs and evaluation results.',
            totalRows: ruleExecTotal?.count || 0,
            completedRows: ruleExecTotal?.count || 0,
            failedRows: 0,
          },
          auditLogs: {
            id: 'audit_logs',
            name: 'Platform Audit Logs',
            description: 'Organization administration, security events, and member changes.',
            totalRows: auditTotal?.count || 0,
            completedRows: auditTotal?.count || 0,
            failedRows: 0,
          },
        },
      };

      return reply.send(metrics);
    } catch (err) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: (err as Error).message || 'Failed to fetch storage metrics',
      });
    }
  });

  // 2. POST /api/admin/storage/clean
  fastify.post<{
    Body: {
      target:
        | 'webhook_outbox'
        | 'integration_deliveries'
        | 'email_outbox'
        | 'event_outbox'
        | 'rule_executions'
        | 'audit_logs'
        | 'all_completed_logs';
      olderThanDays?: number;
    };
  }>('/api/admin/storage/clean', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const { target, olderThanDays = 0 } = request.body || {};
    if (!target) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Target log category is required' });
    }

    const cutoffDate = olderThanDays > 0 ? new Date(Date.now() - olderThanDays * 86400 * 1000) : null;
    let deletedCount = 0;

    try {
      if (target === 'webhook_outbox' || target === 'all_completed_logs') {
        const conditions = [eq(webhookOutbox.status, 'delivered')];
        if (cutoffDate) conditions.push(lte(webhookOutbox.createdAt, cutoffDate));
        const res = await db.delete(webhookOutbox).where(and(...conditions)).returning({ id: webhookOutbox.id });
        deletedCount += res.length;
      }

      if (target === 'integration_deliveries' || target === 'all_completed_logs') {
        const conditions = [eq(integrationDeliveries.status, 'delivered')];
        if (cutoffDate) conditions.push(lte(integrationDeliveries.createdAt, cutoffDate));
        const res = await db.delete(integrationDeliveries).where(and(...conditions)).returning({ id: integrationDeliveries.id });
        deletedCount += res.length;
      }

      if (target === 'email_outbox' || target === 'all_completed_logs') {
        const conditions = [eq(emailNotificationOutbox.status, 'sent')];
        if (cutoffDate) conditions.push(lte(emailNotificationOutbox.createdAt, cutoffDate));
        const res = await db.delete(emailNotificationOutbox).where(and(...conditions)).returning({ id: emailNotificationOutbox.id });
        deletedCount += res.length;
      }

      if (target === 'event_outbox' || target === 'all_completed_logs') {
        const conditions = [eq(eventOutbox.status, 'completed')];
        if (cutoffDate) conditions.push(lte(eventOutbox.createdAt, cutoffDate));
        const res = await db.delete(eventOutbox).where(and(...conditions)).returning({ id: eventOutbox.id });
        deletedCount += res.length;
      }

      if (target === 'rule_executions') {
        const conditions = cutoffDate ? [lte(ruleExecutions.executedAt, cutoffDate)] : [];
        const res = cutoffDate
          ? await db.delete(ruleExecutions).where(and(...conditions)).returning({ id: ruleExecutions.id })
          : await db.delete(ruleExecutions).returning({ id: ruleExecutions.id });
        deletedCount += res.length;
      }

      if (target === 'audit_logs') {
        const conditions = cutoffDate ? [lte(auditLogs.createdAt, cutoffDate)] : [];
        const res = cutoffDate
          ? await db.delete(auditLogs).where(and(...conditions)).returning({ id: auditLogs.id })
          : await db.delete(auditLogs).returning({ id: auditLogs.id });
        deletedCount += res.length;
      }

      return reply.send({
        success: true,
        target,
        deletedCount,
        message: `Successfully cleaned ${deletedCount} record(s) from ${target.replace(/_/g, ' ')}.`,
      });
    } catch (err) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: (err as Error).message || 'Failed to execute storage cleanup',
      });
    }
  });
}
