import crypto from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Validates and sanitizes incoming request ID headers to prevent log spoofing / unbounded input.
 */
export function sanitizeRequestId(rawHeader?: string | string[]): string {
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (value && typeof value === 'string') {
    const trimmed = value.trim();
    // Allow alphanumeric, dash, underscore up to 64 chars
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Fastify hook for request tracing across API requests.
 */
export async function requestTracingHook(request: FastifyRequest, reply: FastifyReply) {
  const requestId = sanitizeRequestId(request.headers['x-request-id']);
  (request as FastifyRequest & { requestId: string }).requestId = requestId;
  reply.header('x-request-id', requestId);
}
