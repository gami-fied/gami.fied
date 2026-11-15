import { db, endUsers } from '@gami/database';
import { checkPrizes, type Prize, type RewardTransaction } from '@gami/rewards';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

export const keySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores');

const amount = z.number().int().min(1).max(100_000_000);

/** One thing a player can be given. Everything is named by key. */
export const prizeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('xp'), amount }),
  z.object({ type: z.literal('currency'), currency: keySchema, amount }),
  z.object({ type: z.literal('achievement'), achievement: keySchema }),
  z.object({ type: z.literal('cosmetic'), cosmetic: keySchema }),
]);

export const prizesSchema = z.array(prizeSchema).max(10);

export const optionalText = (max: number) => z.string().max(max).nullable().optional();
export const optionalUrl = z.string().url().max(512).nullable().optional().or(z.literal(''));
export const optionalDate = z.string().datetime({ offset: true }).nullable().optional();

/** A request that cannot be done, with a code a client can act on. */
export class MechanicError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'MechanicError';
  }
}

export function sendMechanicError(reply: FastifyReply, err: unknown) {
  if (err instanceof MechanicError) return reply.status(err.status).send({ error: err.code, code: err.code, message: err.message });
  throw err;
}

export const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', code: 'BAD_REQUEST', message });
export const notFound = (reply: FastifyReply, what: string) => reply.status(404).send({ error: 'Not Found', code: 'NOT_FOUND', message: `${what} not found` });

/** The first problem in a failed parse, in plain words. */
export const firstIssue = (error: z.ZodError, fallback: string) => {
  const issue = error.issues[0];
  if (!issue) return fallback;
  const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
};

/** Finds a player by the engine's ID or by your own ID for them. */
export async function resolvePlayer(handle: Pick<RewardTransaction, 'select'>, projectId: string, ref: string) {
  const [player] = await handle
    .select({ id: endUsers.id, externalId: endUsers.externalId, active: endUsers.active, name: endUsers.name })
    .from(endUsers)
    .where(and(eq(endUsers.projectId, projectId), sql`(${endUsers.id} = ${ref} OR ${endUsers.externalId} = ${ref})`));
  return player ?? null;
}

/** As `resolvePlayer`, but refuses a missing or deactivated player. */
export async function requirePlayer(handle: Pick<RewardTransaction, 'select'>, projectId: string, ref: string) {
  const player = await resolvePlayer(handle, projectId, ref);
  if (!player) throw new MechanicError('USER_NOT_FOUND', 'User not found', 404);
  if (!player.active) throw new MechanicError('USER_NOT_FOUND', 'This user is deactivated', 403);
  return player;
}

/** Holds a lock named by `name` until the transaction ends, so two requests for the same thing take turns. */
export async function lockFor(tx: RewardTransaction, name: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))`);
}

/** Problems with the things a list of prizes names, or an empty list. */
export const prizeProblems = (projectId: string, prizes: Prize[]) => checkPrizes(db, projectId, prizes);

/** The start of the UTC day `now` falls in. */
export const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
