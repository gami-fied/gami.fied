import { db, users } from '@gami/database';
import { count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../../audit-logs/index.js';
import { requireAuth } from '../../authorization/index.js';

const bootstrapPayloadSchema = z.object({
  bootstrapSecret: z.string().min(1),
});

export async function adminBootstrapRoutes(fastify: FastifyInstance) {
  // 1. GET /api/admin/bootstrap/status (Check if first-time bootstrap is available)
  fastify.get('/api/admin/bootstrap/status', async (request, reply) => {
    const [adminCountRow] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.isPlatformAdmin, true));

    const adminCount = adminCountRow?.total || 0;
    const canBootstrap = adminCount === 0;
    const secretConfigured = Boolean(process.env.PLATFORM_BOOTSTRAP_SECRET);

    return reply.send({
      canBootstrap,
      hasPlatformAdmin: adminCount > 0,
      secretConfigured,
    });
  });

  // 2. POST /api/admin/bootstrap (Atomic First-Time Platform Admin Bootstrap)
  fastify.post('/api/admin/bootstrap', async (request, reply) => {
    // Session authentication required
    const session = await requireAuth(request, reply);
    if (!session) return;

    const configuredSecret = process.env.PLATFORM_BOOTSTRAP_SECRET;
    if (!configuredSecret || !configuredSecret.trim()) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'PLATFORM_BOOTSTRAP_SECRET is not configured on the server',
      });
    }

    const parseResult = bootstrapPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid bootstrap payload. Secret is required.',
      });
    }

    const { bootstrapSecret } = parseResult.data;

    // Execute atomic claim inside database transaction
    try {
      const result = await db.transaction(async (tx) => {
        const [adminCountRow] = await tx
          .select({ total: count() })
          .from(users)
          .where(eq(users.isPlatformAdmin, true));

        if ((adminCountRow?.total || 0) > 0) {
          return {
            status: 409,
            payload: {
              error: 'Conflict',
              message: 'Bootstrap is permanently disabled because a Platform Administrator already exists',
            },
          };
        }

        if (bootstrapSecret !== configuredSecret) {
          return {
            status: 401,
            payload: {
              error: 'Unauthorized',
              message: 'Invalid platform bootstrap secret',
            },
          };
        }

        // Grant Platform Admin role atomically
        await tx
          .update(users)
          .set({ isPlatformAdmin: true, updatedAt: new Date() })
          .where(eq(users.id, session.user.id));

        // Create critical audit event
        await createAuditLog(tx, {
          actorType: 'user',
          actorId: session.user.id,
          action: 'admin.bootstrap_completed',
          severity: 'critical',
          resourceType: 'user',
          resourceId: session.user.id,
          metadata: {
            bootstrappedAt: new Date().toISOString(),
          },
        });

        return {
          status: 200,
          payload: {
            message: 'Platform Administrator successfully bootstrapped',
            isPlatformAdmin: true,
          },
        };
      });

      return reply.status(result.status).send(result.payload);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: (err as Error).message || 'Failed to complete platform bootstrap',
      });
    }
  });
}
