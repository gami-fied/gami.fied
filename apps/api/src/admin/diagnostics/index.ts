import { checkDatabaseHealth } from '@gami/database';
import { checkRedisHealth, getWorkerHeartbeatStatus } from '@gami/queue';
import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';

export async function adminDiagnosticsRoutes(fastify: FastifyInstance) {
  // GET /api/admin/diagnostics - Platform Admin self-hosted installation diagnostics
  fastify.get('/api/admin/diagnostics', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const [dbHealthy, redisHealthy, workerStatus] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      getWorkerHeartbeatStatus(),
    ]);

    const isProduction = process.env.NODE_ENV === 'production';
    const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST !== 'localhost');
    const hasEncryption = Boolean(
      (process.env.ENCRYPTION_MASTER_KEY || process.env.WEBHOOK_MASTER_KEY) &&
        (process.env.ENCRYPTION_MASTER_KEY || process.env.WEBHOOK_MASTER_KEY) !==
          'gami_webhook_master_encryption_key_32bytes!!'
    );
    const hasBetterAuth = Boolean(
      process.env.BETTER_AUTH_SECRET &&
        process.env.BETTER_AUTH_SECRET !== 'super-secret-auth-key-123456789'
    );

    return reply.send({
      timestamp: new Date().toISOString(),
      diagnostics: {
        postgres: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        worker: workerStatus.alive ? 'healthy' : workerStatus.status === 'stale' ? 'stale' : 'offline',
        migrations: dbHealthy ? 'current' : 'unknown',
        smtp: hasSmtp ? 'configured' : 'not_configured',
        encryption: hasEncryption ? 'configured' : 'not_configured',
        authentication: hasBetterAuth ? 'valid' : 'invalid',
        productionMode: isProduction ? 'enabled' : 'disabled',
      },
    });
  });
}
