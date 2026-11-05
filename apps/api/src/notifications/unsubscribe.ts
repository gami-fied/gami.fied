import crypto from 'crypto';
import { db, notificationPreferences } from '@gami/database';
import { verifyUnsubscribeToken } from '@gami/notifications';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const NOTIFICATION_TYPES = [
  'xp_awarded',
  'achievement_unlocked',
  'level_up',
  'challenge_completed',
];

export async function unsubscribeRoutes(fastify: FastifyInstance) {
  const handler = async (
    request: FastifyRequest<{ Querystring: { token?: string } }>,
    reply: FastifyReply
  ) => {
    const target = verifyUnsubscribeToken(request.query.token ?? '');
    if (!target) {
      return reply.status(400).type('text/plain').send('This unsubscribe link is not valid.');
    }

    for (const notificationType of NOTIFICATION_TYPES) {
      await db
        .insert(notificationPreferences)
        .values({
          id: `npf_${crypto.randomUUID()}`,
          projectId: target.projectId,
          userId: target.userId,
          channel: 'email',
          notificationType,
          enabled: false,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.projectId,
            notificationPreferences.userId,
            notificationPreferences.notificationType,
            notificationPreferences.channel,
          ],
          set: { enabled: false, updatedAt: new Date() },
        });
    }

    return reply.type('text/plain').send('You have been unsubscribed from these emails.');
  };

  // GET is the link in the email. POST is the one-click request mail clients send (RFC 8058).
  fastify.get('/v1/email/unsubscribe', handler);
  fastify.post('/v1/email/unsubscribe', handler);
}
