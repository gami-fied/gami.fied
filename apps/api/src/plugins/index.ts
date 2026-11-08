import { listPlugins } from '@gami/rules';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../authorization/index.js';

/** The plugins this server loaded, so the dashboard can offer their actions in the rule builder. */
export async function pluginRoutes(fastify: FastifyInstance) {
  fastify.get('/api/plugins', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    return reply.send(listPlugins());
  });
}
