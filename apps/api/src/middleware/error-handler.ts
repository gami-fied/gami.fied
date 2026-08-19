import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { sanitizeRequestId } from './request-tracing.js';

export interface StandardApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
  // Backwards compatibility top-level aliases for existing consumers
  message: string;
  code: string;
  details?: unknown;
}

export function mapStatusToErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 500:
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

export function globalErrorHandler(
  error: FastifyError & { code?: string; details?: unknown },
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId =
    (request as FastifyRequest & { requestId?: string }).requestId ||
    sanitizeRequestId(request.headers['x-request-id']);

  reply.header('x-request-id', requestId);

  let statusCode = error.statusCode || 500;
  if (error.validation) {
    statusCode = 400;
  }

  let code = error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : mapStatusToErrorCode(statusCode);
  if (code === 'FST_ERR_VALIDATION' || error.validation) {
    code = 'BAD_REQUEST';
  }
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || statusCode === 413) {
    code = 'PAYLOAD_TOO_LARGE';
  }

  const message =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : error.message || 'Internal server error';

  const details = error.validation || error.details || undefined;

  const responseBody: StandardApiErrorResponse = {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
    message,
    code,
    ...(details ? { details } : {}),
  };

  request.log.error({
    err: error,
    requestId,
    statusCode,
    code,
    url: request.url,
    method: request.method,
  });

  return reply.status(statusCode).send(responseBody);
}
