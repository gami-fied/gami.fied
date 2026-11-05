import { projectAlertRoutes } from './projects/alerts.js';
import { errorFormatHook } from './middleware/error-format.js';
import { addUserResolution } from './middleware/resolve-user.js';
import { endUserRoutes } from './public/end-user.js';
import { publicApiRoutes } from './public/gateway.js';
import { startBackupScheduler } from './admin/backups/backup-scheduler.js';
import { unsubscribeRoutes } from './notifications/unsubscribe.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { defaultConfig, product, validateProductionConfig } from '@gami/config';
import { checkDatabaseHealth, runMigrations } from '@gami/database';
import { checkRedisHealth } from '@gami/queue';
import Fastify from 'fastify';
import { achievementRoutes } from './achievements/index.js';
import { adminAuditLogRoutes } from './admin/audit-logs/index.js';
import { adminBackupRoutes } from './admin/backups/index.js';
import { adminBootstrapRoutes } from './admin/bootstrap/index.js';
import { adminConfigRoutes } from './admin/config/index.js';
import { adminDiagnosticsRoutes } from './admin/diagnostics/index.js';
import { adminOrganizationRoutes } from './admin/organizations/index.js';
import { adminSecurityRoutes } from './admin/security/index.js';
import { adminSessionRoutes } from './admin/sessions/index.js';
import { adminSmtpRoutes } from './admin/smtp/index.js';
import { adminStorageRoutes } from './admin/storage/index.js';
import { adminSystemRoutes } from './admin/system/index.js';
import { apiKeyManagementRoutes } from './api-keys/index.js';
import { auditLogRoutes } from './audit-logs/index.js';
import { authRoutes } from './auth/index.js';
import { otpRoutes } from './auth/otp.js';
import { userProfileRoutes } from './user/profile.js';
import { challengeRoutes } from './challenges/index.js';
import { eventRoutes } from './events/index.js';
import { leaderboardRoutes } from './leaderboards/index.js';
import { levelRoutes } from './levels/index.js';
import { emailDeliveryRoutes } from './notifications/deliveries/index.js';
import { notificationRoutes } from './notifications/index.js';
import { notificationPreferenceRoutes } from './notifications/preferences/index.js';
import { organizationRoutes } from './organizations/index.js';
import { organizationDataRoutes } from './organizations/data.js';
import { projectOnboardingRoutes } from './projects/onboarding.js';
import { projectRoutes } from './projects/index.js';
import { ruleRoutes } from './rules/index.js';
import { systemObservabilityRoutes } from './system/index.js';
import { processMetrics } from './system/metrics-collector.js';
import { integrationRoutes } from './integrations/index.js';
import { userRoutes } from './users/index.js';
import { webhookRoutes } from './webhooks/index.js';
import { xpRoutes } from './xp/index.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyticsRoutes } from './analytics/index.js';
import { globalErrorHandler } from './middleware/error-handler.js';
import { ipRateLimitHook } from './middleware/rate-limiter.js';
import { requestTracingHook } from './middleware/request-tracing.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    bodyLimit: 65536, // Enforce 64KB max request body limit across API
    // Only honour X-Forwarded-* when a trusted reverse proxy sets them.
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // Request tracing & correlation ID propagation
  fastify.addHook('onRequest', requestTracingHook);

  // Per-IP ceiling for all routes except health checks
  fastify.addHook('onRequest', ipRateLimitHook);

  // Global standardized API error handler
  fastify.setErrorHandler(globalErrorHandler);

  // Track low-cardinality HTTP metrics & duration histograms
  fastify.addHook('onRequest', async (request) => {
    (request as unknown as { startTime: number }).startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as unknown as { startTime?: number }).startTime || Date.now();
    const durationMs = Date.now() - startTime;
    const route = request.routeOptions?.url || request.url;
    processMetrics.recordHttpRequest(request.method, route, reply.statusCode, durationMs);
  });

  await fastify.register(helmet);

  // Both apply to routes registered below.
  fastify.addHook('onRoute', addUserResolution);
  fastify.addHook('onSend', errorFormatHook);

  // Register CORS for Dashboard and external clients
  const dashboardCors = {
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-request-id',
      'Idempotency-Key',
      'Cookie',
    ],
  };
  // End-user tokens are made for customers' sites. A preflight carries no token, so the site is
  // checked against the project's allowlist on the real request.
  const endUserCors = { origin: true, credentials: false, methods: ['GET', 'OPTIONS'] };

  await fastify.register(
    cors,
    () => (request: { url?: string }, callback: (error: Error | null, options: object) => void) => {
      callback(null, request.url?.startsWith('/v1/me') ? endUserCors : dashboardCors);
    }
  );

  // Serve OpenAPI 3.1 Specification JSON
  fastify.get('/openapi.json', async (_request, reply) => {
    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const possiblePaths = [
        path.resolve(__dirname, '../../../../docs/openapi.json'),
        path.resolve(process.cwd(), 'docs/openapi.json'),
        path.resolve(process.cwd(), '../../docs/openapi.json'),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          return reply.type('application/json').send(content);
        }
      }

      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'OpenAPI specification document not found' },
        message: 'OpenAPI specification document not found',
        code: 'NOT_FOUND',
      });
    } catch {
      return reply.status(500).send({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load OpenAPI specification' },
        message: 'Failed to load OpenAPI specification',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  });

  // Root route
  fastify.get('/', async (_request, reply) => {
    return reply.status(200).send({
      name: 'Gami.Fied Community Engine API',
      version: product.version,
      status: 'online',
      health: '/health',
      ready: '/ready',
      openapi: '/openapi.json',
    });
  });

  // Lightweight process liveness health check (No auth, no external I/O)
  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Deep dependency readiness check (Probes PostgreSQL & Redis ONLY)
  fastify.get('/ready', async (_request, reply) => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    if (!dbHealthy || !redisHealthy) {
      return reply.status(503).send({
        status: 'not_ready',
        postgres: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(200).send({
      status: 'ready',
      postgres: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    });
  });

  // Register Better Auth handler & auth endpoints
  await fastify.register(authRoutes);

  // Register Organization management endpoints
  await fastify.register(organizationRoutes);
  await fastify.register(organizationDataRoutes);

  // Register Dashboard Project endpoints
  await fastify.register(projectRoutes);

  // Register API Key management endpoints
  await fastify.register(apiKeyManagementRoutes);

  // Register Event ingestion & inspection endpoints
  await fastify.register(eventRoutes);

  // Register Rules Engine Management & Preview endpoints
  await fastify.register(ruleRoutes);

  // Register Users API management endpoints
  await fastify.register(userRoutes);

  // Register XP System endpoints
  await fastify.register(xpRoutes);

  // Register Achievement System endpoints
  await fastify.register(achievementRoutes);

  // Register Level & Progression System endpoints
  await fastify.register(levelRoutes);

  // Register Leaderboard & Ranking System endpoints
  await fastify.register(leaderboardRoutes);

  // Register Challenges & Quests endpoints
  await fastify.register(challengeRoutes);

  // Register Notification System & In-App Outbox endpoints
  await fastify.register(notificationRoutes);

  // Register Notification Preference endpoints
  await fastify.register(notificationPreferenceRoutes);

  // Register Email Deliveries endpoints
  await fastify.register(emailDeliveryRoutes);

  // Register Platform Admin endpoints (/api/admin/*)
  await fastify.register(adminBootstrapRoutes);
  await fastify.register(adminSystemRoutes);
  await fastify.register(adminOrganizationRoutes);
  await fastify.register(adminConfigRoutes);
  await fastify.register(adminSecurityRoutes);
  await fastify.register(adminAuditLogRoutes);
  await fastify.register(adminSessionRoutes);
  await fastify.register(adminSmtpRoutes);
  await fastify.register(adminStorageRoutes);
  await fastify.register(adminDiagnosticsRoutes);
  await fastify.register(adminBackupRoutes);

  // Register Webhooks & External Event Delivery endpoints
  await fastify.register(webhookRoutes);

  // Register External Integration Framework endpoints (Discord, etc.)
  await fastify.register(integrationRoutes);

  // Register Audit Logs endpoints
  await fastify.register(auditLogRoutes);

  // Register System Observability & Metrics endpoints
  await fastify.register(systemObservabilityRoutes);

  // Register Project Onboarding Checklist backend endpoint
  await fastify.register(projectOnboardingRoutes);
  await fastify.register(projectAlertRoutes);

  // Register Email OTP Verification & User Profile endpoints
  await fastify.register(otpRoutes);
  await fastify.register(userProfileRoutes);
  await fastify.register(unsubscribeRoutes);
  await fastify.register(publicApiRoutes);
  await fastify.register(endUserRoutes);

  // Register Project Analytics & Reporting endpoints (/api/projects/:projectId/analytics/*)
  await fastify.register(analyticsRoutes);

  return fastify;
}

export const buildApp = buildServer;

/** The dashboard's address, anything in TRUSTED_ORIGINS, and localhost outside production. */
function getAllowedOrigins(): string[] {
  const configured = [
    process.env['NEXT_PUBLIC_APP_URL'],
    ...(process.env['TRUSTED_ORIGINS']?.split(',') ?? []),
  ];
  const local =
    process.env['NODE_ENV'] === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:3001'];

  return [
    ...new Set([...local, ...configured.map((origin) => origin?.trim()).filter(Boolean)]),
  ] as string[];
}

async function start() {
  validateProductionConfig();

  // A failed migration means the code and schema disagree, so the API must not serve traffic.
  try {
    await runMigrations();
  } catch (err) {
    console.error('[API] Migration failed, refusing to start:', err);
    process.exit(1);
  }
  const app = await buildServer();
  try {
    await app.listen({ port: defaultConfig.port, host: '0.0.0.0' });
    app.log.info(`🚀 API server listening on http://0.0.0.0:${defaultConfig.port}`);
    startBackupScheduler();

    const handleShutdown = async (signal: string) => {
      app.log.info(`[API] Received ${signal}, closing Fastify server gracefully...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
