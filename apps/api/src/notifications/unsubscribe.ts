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

/** A small page with no scripts, so it needs nothing the API's content policy would block. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5;color:#18181b}
button{font:inherit;padding:.6rem 1.2rem;border:0;background:#18181b;color:#fff;cursor:pointer}
</style>
</head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>`;
}

type UnsubscribeRequest = FastifyRequest<{ Querystring: { token?: string } }>;

export async function unsubscribeRoutes(app: FastifyInstance) {
  // In its own scope, so only these routes accept a form post.
  await app.register(unsubscribeScope);
}

async function unsubscribeScope(fastify: FastifyInstance) {
  // The page's button and mail clients both post a form (`List-Unsubscribe=One-Click`), not JSON.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: 4096 },
    (_request, body, done) => done(null, body)
  );

  const invalid = (reply: FastifyReply) =>
    reply.status(400).type('text/plain').send('This unsubscribe link is not valid.');

  // The link in the email. Opening it only asks, because mail scanners open links to check them,
  // and that must not unsubscribe anyone.
  fastify.get('/v1/email/unsubscribe', async (request: UnsubscribeRequest, reply) => {
    const token = request.query.token ?? '';
    if (!verifyUnsubscribeToken(token)) return invalid(reply);

    return reply.type('text/html; charset=utf-8').send(
      page(
        'Unsubscribe from these emails?',
        `<p>You will stop getting emails about XP, achievements, levels and challenges.</p>
<form method="post" action="/v1/email/unsubscribe?token=${encodeURIComponent(token)}">
<button type="submit">Unsubscribe</button>
</form>`
      )
    );
  });

  // The button on that page, and the one-click request mail clients send (RFC 8058).
  fastify.post('/v1/email/unsubscribe', async (request: UnsubscribeRequest, reply) => {
    const target = verifyUnsubscribeToken(request.query.token ?? '');
    if (!target) return invalid(reply);

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

    const done = 'You have been unsubscribed from these emails.';
    return String(request.headers.accept ?? '').includes('text/html')
      ? reply.type('text/html; charset=utf-8').send(page('Unsubscribed', `<p>${done}</p>`))
      : reply.type('text/plain').send(done);
  });
}
