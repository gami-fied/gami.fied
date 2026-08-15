import { apiKeys, db } from '@gami/database';
import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';
import { createApiKey } from '../services/api-key.service.js';

export async function apiKeyManagementRoutes(fastify: FastifyInstance) {
  // Create API Key
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/api-keys',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const { name } = (request.body as { name?: string }) || {};
      if (!name) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Name is required' });
      }

      const generatedKey = await createApiKey(projectId, name);
      return reply.status(201).send(generatedKey);
    }
  );

  // List API Keys (Never returns keyHash or rawSecret)
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/api-keys',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const keys = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.projectId, projectId));

      return reply.send(keys);
    }
  );

  // Revoke API Key
  fastify.delete<{ Params: { projectId: string; keyId: string } }>(
    '/api/projects/:projectId/api-keys/:keyId',
    async (request, reply) => {
      const { projectId, keyId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      const [revokedKey] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId)))
        .returning();

      if (!revokedKey) {
        return reply.status(404).send({ error: 'Not Found', message: 'API key not found' });
      }

      return reply.send({ success: true, message: 'API key revoked' });
    }
  );
}
