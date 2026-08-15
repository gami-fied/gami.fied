import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisConnection } from '@gami/queue';

const RATE_LIMIT_MAX = Number(process.env['RATE_LIMIT_MAX']) || 100;
const RATE_LIMIT_WINDOW = Number(process.env['RATE_LIMIT_WINDOW']) || 60;

export async function checkRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string
): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const currentWindow = Math.floor(Date.now() / (RATE_LIMIT_WINDOW * 1000));
    const key = `ratelimit:project:${projectId}:${currentWindow}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }

    const remaining = Math.max(0, RATE_LIMIT_MAX - count);
    const resetTime = (currentWindow + 1) * RATE_LIMIT_WINDOW;

    reply.header('X-RateLimit-Limit', RATE_LIMIT_MAX);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetTime);

    if (count > RATE_LIMIT_MAX) {
      reply.header('Retry-After', RATE_LIMIT_WINDOW);
      reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit of ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW}s exceeded`,
      });
      return false;
    }
  } catch (err: unknown) {
    // FAIL-OPEN: If Redis is unavailable, allow the request to proceed to PostgreSQL outbox
    request.log.warn(
      { err },
      '[RateLimiter] Redis unavailable — failing open to ensure event acceptance'
    );
  }

  return true;
}
