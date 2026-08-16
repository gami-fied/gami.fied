import crypto from 'crypto';
import { db, notificationPreferences } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../../authorization/index.js';

const preferenceItemSchema = z.object({
  channel: z.enum(['in_app', 'email']),
  notificationType: z.enum([
    'xp_awarded',
    'achievement_unlocked',
    'level_up',
    'challenge_completed',
  ]),
  enabled: z.boolean(),
});

const updatePreferencesSchema = z.object({
  preferences: z.array(preferenceItemSchema).min(1),
});

const ALL_TYPES = [
  'xp_awarded',
  'achievement_unlocked',
  'level_up',
  'challenge_completed',
] as const;

export async function notificationPreferenceRoutes(fastify: FastifyInstance) {
  // Get User Notification Preferences (Project Tenant Isolated)
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/notification-preferences',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const existingPrefs = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.projectId, projectId),
            eq(notificationPreferences.userId, userId)
          )
        );

      // Build complete preference list with defaults if not saved yet
      const channels = ['in_app', 'email'] as const;
      const resultPreferences = [];

      for (const channel of channels) {
        for (const type of ALL_TYPES) {
          const match = existingPrefs.find(
            (p) => p.channel === channel && p.notificationType === type
          );
          const defaultEnabled = channel === 'in_app';
          resultPreferences.push({
            id: match?.id || null,
            projectId,
            userId,
            channel,
            notificationType: type,
            enabled: match ? match.enabled : defaultEnabled,
            createdAt: match ? match.createdAt : new Date(),
            updatedAt: match ? match.updatedAt : new Date(),
          });
        }
      }

      return reply.send({
        projectId,
        userId,
        preferences: resultPreferences,
      });
    }
  );

  // Update User Notification Preferences (Project Tenant Isolated)
  fastify.patch<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/notification-preferences',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parseResult = updatePreferencesSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid notification preferences payload',
          details: parseResult.error.format(),
        });
      }

      const { preferences } = parseResult.data;
      const updatedPrefs = [];

      for (const pref of preferences) {
        const prefId = `np_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const [upserted] = await db
          .insert(notificationPreferences)
          .values({
            id: prefId,
            projectId,
            userId,
            channel: pref.channel,
            notificationType: pref.notificationType,
            enabled: pref.enabled,
          })
          .onConflictDoUpdate({
            target: [
              notificationPreferences.projectId,
              notificationPreferences.userId,
              notificationPreferences.channel,
              notificationPreferences.notificationType,
            ],
            set: {
              enabled: pref.enabled,
              updatedAt: new Date(),
            },
          })
          .returning();

        if (upserted) {
          updatedPrefs.push(upserted);
        }
      }

      return reply.send({
        projectId,
        userId,
        updated: updatedPrefs.length,
        preferences: updatedPrefs,
      });
    }
  );
}
