import { apiKeys, db, getPlatformSettings } from '@gami/database';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';
import { DEFAULT_API_KEY_SCOPES, isValidScope } from '../authorization/permissions.js';
import { createApiKey } from '../services/api-key.service.js';

const DEFAULT_ROTATION_OVERLAP_HOURS = 24;
const MAX_ROTATION_OVERLAP_HOURS = 168;

const createKeySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(128),
  scopes: z
    .array(z.string().refine(isValidScope, { message: 'Unknown API key scope' }))
    .min(1, 'Select at least one scope')
    .optional(),
  expiresAt: z
    .string()
    .datetime()
    .refine((value) => new Date(value) > new Date(), { message: 'Expiry must be in the future' })
    .optional(),
});

const rotateKeySchema = z.object({
  overlapHours: z.number().int().min(0).max(MAX_ROTATION_OVERLAP_HOURS).optional(),
});

export async function apiKeyManagementRoutes(fastify: FastifyInstance) {
  // Create API Key
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/api-keys',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const { allowApiKeyCreation } = await getPlatformSettings('registration');
      if (!allowApiKeyCreation) {
        return reply.status(403).send({
          error: 'Forbidden',
          code: 'API_KEY_CREATION_DISABLED',
          message: 'API key creation is disabled on this instance',
        });
      }

      const parsed = createKeySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: parsed.error.issues[0]?.message ?? 'Invalid API key payload',
        });
      }

      const { name, scopes, expiresAt } = parsed.data;
      const generatedKey = await createApiKey(
        projectId,
        name,
        scopes ?? DEFAULT_API_KEY_SCOPES,
        expiresAt ? new Date(expiresAt) : null
      );

      await createAuditLog(db, {
        projectId,
        actorType: 'user',
        actorId: authResult.membership.userId,
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: generatedKey.id,
        metadata: { name, scopes: generatedKey.scopes },
      });

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
          scopes: apiKeys.scopes,
          expiresAt: apiKeys.expiresAt,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.projectId, projectId));

      return reply.send(keys);
    }
  );

  // Rotate API Key: issues a replacement and keeps the old key alive for an overlap window
  fastify.post<{ Params: { projectId: string; keyId: string } }>(
    '/api/projects/:projectId/api-keys/:keyId/rotate',
    async (request, reply) => {
      const { projectId, keyId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parsed = rotateKeySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `overlapHours must be between 0 and ${MAX_ROTATION_OVERLAP_HOURS}`,
        });
      }

      const [existing] = await db
        .select()
        .from(apiKeys)
        .where(
          and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt))
        );

      if (!existing) {
        return reply.status(404).send({ error: 'Not Found', message: 'API key not found' });
      }

      const overlapHours = parsed.data.overlapHours ?? DEFAULT_ROTATION_OVERLAP_HOURS;
      const oldKeyExpiresAt = new Date(Date.now() + overlapHours * 60 * 60 * 1000);

      const replacement = await createApiKey(
        projectId,
        existing.name,
        existing.scopes as string[],
        existing.expiresAt
      );

      await db
        .update(apiKeys)
        .set({ expiresAt: oldKeyExpiresAt, updatedAt: new Date() })
        .where(eq(apiKeys.id, keyId));

      await createAuditLog(db, {
        projectId,
        actorType: 'user',
        actorId: authResult.membership.userId,
        action: 'api_key.rotated',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { replacementKeyId: replacement.id, overlapHours },
      });

      return reply.status(201).send({ ...replacement, previousKeyExpiresAt: oldKeyExpiresAt });
    }
  );

  // Revoke API Key
  fastify.delete<{ Params: { projectId: string; keyId: string } }>(
    '/api/projects/:projectId/api-keys/:keyId',
    async (request, reply) => {
      const { projectId, keyId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [updatedKey] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId)))
        .returning();

      if (!updatedKey) {
        return reply.status(404).send({ error: 'Not Found', message: 'API key not found' });
      }

      await createAuditLog(db, {
        projectId,
        actorType: 'user',
        actorId: authResult.membership.userId,
        action: 'api_key.revoked',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { name: updatedKey.name },
      });

      return reply.send({ success: true, message: 'API key revoked' });
    }
  );
}
