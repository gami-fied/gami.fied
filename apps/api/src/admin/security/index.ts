import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../../authorization/index.js';
import { securityConfigSchema, ServerConfigService } from '../../services/server-config.service.js';

export async function adminSecurityRoutes(fastify: FastifyInstance) {
  // GET /api/admin/security (Current Security Policies & Status)
  fastify.get('/api/admin/security', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const securityStatus = await ServerConfigService.getConfigStatus('security');
    const registrationStatus = await ServerConfigService.getConfigStatus('registration');

    return reply.send({
      security: securityStatus,
      registration: registrationStatus,
    });
  });

  // PATCH /api/admin/security (Update Security Policies)
  fastify.patch('/api/admin/security', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const payload = request.body as Record<string, unknown>;

    try {
      const updatedStatus = await ServerConfigService.setConfig(
        'security',
        payload,
        adminAuth.session.user.id
      );

      return reply.send({
        message: 'Security configuration policies updated successfully',
        security: updatedStatus,
      });
    } catch (err: unknown) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: (err as Error).message || 'Failed to update security configuration',
      });
    }
  });
}
