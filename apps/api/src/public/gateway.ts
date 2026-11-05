import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateApiKey } from '../services/api-key.service.js';
import { PUBLIC_ROUTES } from './routes.js';

const FORWARDED_REQUEST_HEADERS = ['x-api-key', 'content-type', 'idempotency-key', 'x-request-id'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-request-id'];

/**
 * Serves `/v1/*` by working out the project from the API key and calling the project route.
 * That route still checks scopes, so the public API cannot do more than the key allows.
 */
async function forwardToProjectRoute(request: FastifyRequest, reply: FastifyReply) {
  const auth = await authenticateApiKey(String(request.headers['x-api-key'] ?? ''));
  if (!auth) {
    return reply
      .status(401)
      .send({ code: 'UNAUTHORIZED', message: 'A valid x-api-key header is required' });
  }
  if (auth.isSuspended) {
    return reply
      .status(403)
      .send({ code: 'FORBIDDEN', message: 'Organization account is suspended' });
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  const response = await request.server.inject({
    method: request.method as 'GET',
    url: `/api/projects/${auth.project.id}${request.url.slice('/v1'.length)}`,
    headers,
    payload: request.body as string | object | undefined,
    remoteAddress: request.ip,
  });

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers[name];
    if (value !== undefined) reply.header(name, value);
  }
  return reply.status(response.statusCode).send(response.rawPayload);
}

export async function publicApiRoutes(fastify: FastifyInstance) {
  for (const route of PUBLIC_ROUTES) {
    fastify.route({ method: route.method, url: `/v1${route.path}`, handler: forwardToProjectRoute });
  }
}
