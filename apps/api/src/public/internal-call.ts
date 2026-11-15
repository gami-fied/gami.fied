/**
 * Marks a request the server sends to itself. The `/v1` gateway answers by calling the matching
 * project route inside the same process, and that inner call must not be counted against the
 * caller's rate limit a second time, or look the API key up again.
 *
 * The marker is a header holding a secret made when the process starts, so a client cannot fake it.
 */
import crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import type { authenticateApiKey } from '../services/api-key.service.js';

export type ApiKeyAuth = NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>;

const HEADER = 'x-gami-internal';
const SECRET = crypto.randomBytes(24).toString('hex');
const pending = new Map<string, ApiKeyAuth>();

function callId(request: FastifyRequest): string | null {
  const value = request.headers[HEADER];
  if (typeof value !== 'string') return null;
  const [secret, id] = value.split('.');
  if (!secret || !id || secret.length !== SECRET.length) return null;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(SECRET)) ? id : null;
}

/** Starts an inner call for an API key that has already been checked. Call `end` when it returns. */
export function beginInternalCall(auth: ApiKeyAuth): {
  headers: Record<string, string>;
  end: () => void;
} {
  const id = crypto.randomUUID();
  pending.set(id, auth);
  return { headers: { [HEADER]: `${SECRET}.${id}` }, end: () => pending.delete(id) };
}

/** True for a request this server sent to itself. */
export function isInternalCall(request: FastifyRequest): boolean {
  return callId(request) !== null;
}

/** The API key the gateway already checked for this inner call, if it is one. */
export function internalCallAuth(request: FastifyRequest): ApiKeyAuth | null {
  const id = callId(request);
  return (id && pending.get(id)) || null;
}
