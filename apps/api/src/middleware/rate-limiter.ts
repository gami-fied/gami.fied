import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPlatformSettings } from '@gami/database';
import { getRedisConnection } from '@gami/queue';

/**
 * Counts a hit against a named limit and reports whether it is still within the limit.
 * Fails open if Redis is down, because losing the limiter must not take the API down.
 */
export async function consumeRateLimit(
  name: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const key = `ratelimit:${name}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= max;
  } catch {
    return true;
  }
}

const IP_LIMIT_EXEMPT_ROUTES = new Set(['/health', '/ready']);

/** Global per-IP ceiling that sits above the per-project limit on event ingestion. */
export async function ipRateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  if (process.env['NODE_ENV'] === 'test' && !process.env['RATE_LIMIT_IP_MAX']) return;
  if (IP_LIMIT_EXEMPT_ROUTES.has(request.url.split('?')[0] ?? '')) return;

  const { perIpLimit: max, windowMs } = await getPlatformSettings('rate_limits');
  const windowSeconds = Math.ceil(windowMs / 1000);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));

  if (!(await consumeRateLimit(`ip:${request.ip}:${bucket}`, max, windowSeconds))) {
    reply.header('Retry-After', windowSeconds);
    return reply.status(429).send({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this address',
        requestId: (request as FastifyRequest & { requestId?: string }).requestId,
      },
      message: 'Too many requests from this address',
      code: 'TOO_MANY_REQUESTS',
    });
  }
}

export async function checkRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string
): Promise<boolean> {
  const { perProjectLimit: maxRequests, windowMs } = await getPlatformSettings('rate_limits');
  const windowSeconds = Math.ceil(windowMs / 1000);

  try {
    const redis = getRedisConnection();
    const currentWindow = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `ratelimit:project:${projectId}:${currentWindow}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - count);
    const resetTime = (currentWindow + 1) * windowSeconds;

    reply.header('X-RateLimit-Limit', maxRequests);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetTime);

    if (count > maxRequests) {
      reply.header('Retry-After', windowSeconds);
      reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit of ${maxRequests} requests per ${windowSeconds}s exceeded`,
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
