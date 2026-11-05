import crypto from 'crypto';
import { db, endUsers, eventOutbox, events, isUniqueViolation, type Event } from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, eq } from 'drizzle-orm';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface IngestEventInput {
  projectId: string;
  eventType: string;
  externalUserId?: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  idempotencyKey?: string;
}

export type IngestEventResult =
  | { outcome: 'accepted'; id: string; duplicate: boolean }
  | { outcome: 'idempotency_mismatch' }
  | { outcome: 'user_deactivated' };

/** JSON with sorted keys, because `jsonb` does not keep the order a client sent. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function resolveRepeat(existing: Event, input: IngestEventInput): IngestEventResult {
  const sameRequest =
    existing.type === input.eventType &&
    canonicalJson(existing.payload ?? {}) === canonicalJson(input.payload);

  return sameRequest
    ? { outcome: 'accepted', id: existing.id, duplicate: true }
    : { outcome: 'idempotency_mismatch' };
}

async function findByIdempotencyKey(
  client: typeof db | Transaction,
  projectId: string,
  idempotencyKey: string
): Promise<Event | undefined> {
  const [existing] = await client
    .select()
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey)));
  return existing;
}

/** Returns the internal user ID, or null when that user has been deactivated. */
async function resolveEndUser(
  tx: Transaction,
  projectId: string,
  externalId: string
): Promise<string | null> {
  const find = async () => {
    const [user] = await tx
      .select({ id: endUsers.id, active: endUsers.active })
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, externalId)));
    return user;
  };

  const existing = await find();
  if (existing) return existing.active ? existing.id : null;

  const [created] = await tx
    .insert(endUsers)
    .values({
      id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      projectId,
      externalId,
    })
    .onConflictDoNothing()
    .returning({ id: endUsers.id });

  if (!created) {
    // A concurrent request created this user first.
    const winner = await find();
    return winner?.active ? winner.id : null;
  }

  await createWebhookDelivery(tx, {
    projectId,
    eventId: `user_created_${created.id}`,
    eventType: 'user.created',
    userId: created.id,
    data: { externalId },
  });

  return created.id;
}

/**
 * The single way events enter the system. User creation, its webhook, the event and its outbox
 * row commit together, and a repeated idempotency key never creates a second event.
 */
export async function ingestEvent(input: IngestEventInput): Promise<IngestEventResult> {
  const { projectId, eventType, externalUserId, payload, occurredAt, idempotencyKey } = input;

  try {
    return await db.transaction(async (tx): Promise<IngestEventResult> => {
      if (idempotencyKey) {
        const existing = await findByIdempotencyKey(tx, projectId, idempotencyKey);
        if (existing) return resolveRepeat(existing, input);
      }

      let userId: string | null = null;
      if (externalUserId) {
        userId = await resolveEndUser(tx, projectId, externalUserId);
        if (!userId) return { outcome: 'user_deactivated' };
      }

      const id = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await tx.insert(events).values({
        id,
        projectId,
        userId,
        type: eventType,
        payload,
        idempotencyKey: idempotencyKey || null,
        occurredAt,
      });
      await tx.insert(eventOutbox).values({
        id: `out_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        eventId: id,
        status: 'pending',
      });

      return { outcome: 'accepted', id, duplicate: false };
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err) && idempotencyKey) {
      const existing = await findByIdempotencyKey(db, projectId, idempotencyKey);
      if (existing) return resolveRepeat(existing, input);
    }
    throw err;
  }
}
