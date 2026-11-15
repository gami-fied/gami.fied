import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPlatformSettings } from '@gami/database';
import { getRedisConnection } from '@gami/queue';
import { isInternalCall } from '../public/internal-call.js';

/**
 * Adds one to a counter that expires. The expiry is set before the count, in one transaction, so a
 * counter can never be left behind without one and block someone for good.
 */
export async function countWithExpiry(redis: ReturnType<typeof getRedisConnection>, key: string, windowSeconds: number): Promise<number> {
  const results = await redis.multi().set(key, 0, 'EX', windowSeconds, 'NX').incr(key).exec();
  const [error, value] = results?.[1] ?? [new Error('Redis did not answer'), null];
  if (error) throw error;
  return Number(value);
}

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
    return (await countWithExpiry(redis, key, windowSeconds)) <= max;
  } catch {
    return true;
  }
}

/**
 * A ceiling for one caller: an API key, or one player's tokens. It sits under the limit per
 * address, so a single key or player cannot use up what an address is allowed. Returns false after
 * answering 429.
 */
export async function checkCallerRateLimit(reply: FastifyReply, kind: 'key' | 'player', id: string): Promise<boolean> {
  // Tests share a few keys across many calls, so they opt in by setting the limit.
  const variable = kind === 'key' ? 'RATE_LIMIT_KEY_MAX' : 'RATE_LIMIT_PLAYER_MAX';
  if (process.env['NODE_ENV'] === 'test' && !process.env[variable]) return true;

  const settings = await getPlatformSettings('rate_limits');
  const max = kind === 'key' ? settings.perApiKeyLimit : settings.perPlayerLimit;
  const windowSeconds = Math.ceil(settings.windowMs / 1000);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  if (await consumeRateLimit(`${kind}:${id}:${bucket}`, max, windowSeconds)) return true;

  const message = kind === 'key' ? 'Too many requests with this API key' : 'Too many requests for this user';
  reply.header('Retry-After', windowSeconds);
  await reply.status(429).send({ error: { code: 'TOO_MANY_REQUESTS', message }, message, code: 'TOO_MANY_REQUESTS' });
  return false;
}

const IP_LIMIT_EXEMPT_ROUTES = new Set(['/health', '/ready']);

/** Global per-IP ceiling that sits above the per-project limit on event ingestion. */
export async function ipRateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  if (process.env['NODE_ENV'] === 'test' && !process.env['RATE_LIMIT_IP_MAX']) return;
  if (IP_LIMIT_EXEMPT_ROUTES.has(request.url.split('?')[0] ?? '')) return;
  // The /v1 gateway calls the project route inside this process. The outer request was already counted.
  if (isInternalCall(request)) return;

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

/**
 * An organization's own ceiling on event requests per project per minute, set by the platform
 * administrator. It sits under the instance-wide limit. Fails open if Redis is down, like the rest.
 */
export async function checkPolicyRateLimit(request: FastifyRequest, reply: FastifyReply, projectId: string, perMinute: number | null): Promise<boolean> {
  if (!perMinute) return true;
  try {
    const redis = getRedisConnection();
    const minute = Math.floor(Date.now() / 60_000);
    const key = `ratelimit:policy:${projectId}:${minute}`;
    const used = await countWithExpiry(redis, key, 60);
    if (used > perMinute) {
      reply.header('Retry-After', 60 - Math.floor((Date.now() / 1000) % 60));
      reply.status(429).send({ code: 'TOO_MANY_REQUESTS', message: `This organization may send at most ${perMinute} event requests a minute per project` });
      return false;
    }
  } catch (err: unknown) {
    request.log.warn({ err }, '[RateLimiter] Redis unavailable for the organization limit, failing open');
  }
  return true;
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

    const count = await countWithExpiry(redis, key, windowSeconds);

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
