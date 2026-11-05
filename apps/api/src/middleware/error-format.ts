import type { FastifyReply, FastifyRequest } from 'fastify';
import { mapStatusToErrorCode } from './error-handler.js';

interface LooseErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
  [key: string]: unknown;
}

/**
 * Gives every error response one shape, whatever the route sent:
 * `{ error: { code, message, requestId, details } }`. Top-level `message` and `code` stay for
 * existing clients, along with any other fields the route added.
 */
export async function errorFormatHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<unknown> {
  const contentType = String(reply.getHeader('content-type') ?? '');
  if (reply.statusCode < 400 || !contentType.includes('json') || typeof payload !== 'string') {
    return payload;
  }

  let body: LooseErrorBody;
  try {
    body = JSON.parse(payload) as LooseErrorBody;
  } catch {
    return payload;
  }

  const existing = body.error;
  const nested =
    existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {};

  const statusLabel = typeof existing === 'string' ? existing : undefined;
  const message = nested.message ?? body.message ?? statusLabel ?? 'Request failed';
  const code = nested.code ?? body.code ?? mapStatusToErrorCode(reply.statusCode);
  const details = nested.details ?? body.details;
  const requestId =
    nested.requestId ?? (request as FastifyRequest & { requestId?: string }).requestId;

  return JSON.stringify({
    ...body,
    error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
    message,
    code,
  });
}
