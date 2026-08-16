import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePlatformAdmin } from '../../authorization/index.js';
import { ALLOWED_CONFIG_SCHEMAS, ServerConfigService } from '../../services/server-config.service.js';

const updateConfigSchema = z.object({
  category: z.string().min(1),
  payload: z.record(z.unknown()),
});

export async function adminConfigRoutes(fastify: FastifyInstance) {
  // GET /api/admin/config (Safe allowlisted server configuration status)
  fastify.get('/api/admin/config', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const categories = Object.keys(ALLOWED_CONFIG_SCHEMAS);
    const configStatuses: Record<string, unknown> = {};

    for (const category of categories) {
      configStatuses[category] = await ServerConfigService.getConfigStatus(category);
    }

    return reply.send({
      configuredCategories: categories,
      configurations: configStatuses,
    });
  });

  // PATCH /api/admin/config (Update allowlisted server configuration category)
  fastify.patch('/api/admin/config', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const parseResult = updateConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid configuration update payload',
        details: parseResult.error.format(),
      });
    }

    const { category, payload } = parseResult.data;

    try {
      const updatedStatus = await ServerConfigService.setConfig(
        category,
        payload,
        adminAuth.session.user.id
      );

      return reply.send({
        message: `Server configuration category "${category}" updated successfully`,
        status: updatedStatus,
      });
    } catch (err: unknown) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: (err as Error).message || 'Failed to update configuration',
      });
    }
  });
}
