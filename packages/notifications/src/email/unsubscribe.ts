import { createHmac, timingSafeEqual } from 'crypto';
import { getAuthSecret } from '@gami/database';

export interface UnsubscribeTarget {
  projectId: string;
  userId: string;
}

function sign(payload: string): string {
  return createHmac('sha256', getAuthSecret())
    .update(`unsubscribe:${payload}`)
    .digest('base64url');
}

/** The token carries its own proof, so an emailed link needs no sign-in and no stored state. */
export function createUnsubscribeToken({ projectId, userId }: UnsubscribeTarget): string {
  const payload = Buffer.from(JSON.stringify([projectId, userId])).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTarget | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const [projectId, userId] = JSON.parse(Buffer.from(payload, 'base64url').toString()) as string[];
  return projectId && userId ? { projectId, userId } : null;
}
