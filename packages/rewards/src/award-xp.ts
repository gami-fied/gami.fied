import { randomUUID } from 'crypto';
import { db, levels, userXpBalances, xpLedger, type XpLedger } from '@gami/database';
import { createNotificationIntent, generateLevelUpSourceId } from '@gami/notifications';
import { getLevelsCrossed } from '@gami/progression';
import { createWebhookDelivery } from '@gami/webhooks';
import { eq, sql } from 'drizzle-orm';

export type RewardTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AwardXpInput {
  projectId: string;
  userId: string;
  /** Negative amounts are manual deductions, and they cannot take a balance below zero. */
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
  eventId?: string | null;
  ruleId?: string | null;
  ruleExecutionId?: string | null;
  /** Position in the rule's action list, so one rule can award XP more than once. */
  actionIndex?: number;
  idempotencyKey?: string | null;
  /** Extra fields for the `xp.awarded` webhook. */
  webhookData?: Record<string, unknown>;
}

export type AwardXpResult =
  | { duplicate: true }
  | {
      duplicate: false;
      entry: XpLedger;
      previousXp: number;
      newXp: number;
      levelsCrossed: number[];
    };

/** The adjustment would take the balance below zero. Nothing has been written. */
export class InsufficientXpError extends Error {
  constructor(
    public readonly balance: number,
    public readonly amount: number
  ) {
    super(`Cannot apply ${amount} XP to a balance of ${balance}`);
    this.name = 'InsufficientXpError';
  }
}

/**
 * The only way XP is written: ledger row, balance, notifications and webhooks all commit together.
 * A repeat of the same rule action or idempotency key returns `duplicate` and changes nothing, so
 * callers can retry freely.
 */
export async function awardXp(tx: RewardTransaction, input: AwardXpInput): Promise<AwardXpResult> {
  const { projectId, userId, amount, reason } = input;

  const [entry] = await tx
    .insert(xpLedger)
    .values({
      id: `xpl_${randomUUID()}`,
      projectId,
      userId,
      eventId: input.eventId ?? null,
      ruleId: input.ruleId ?? null,
      ruleExecutionId: input.ruleExecutionId ?? null,
      actionIndex: input.actionIndex ?? 0,
      idempotencyKey: input.idempotencyKey ?? null,
      amount,
      reason,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning();

  if (!entry) return { duplicate: true };

  // The upsert locks the balance row, so concurrent deductions see each other's result. Throwing
  // here rolls the ledger row back with the rest of the transaction.
  const [balance] = await tx
    .insert(userXpBalances)
    .values({ id: `xpb_${randomUUID()}`, projectId, userId, totalXp: amount })
    .onConflictDoUpdate({
      target: [userXpBalances.projectId, userXpBalances.userId],
      set: { totalXp: sql`user_xp_balances.total_xp + ${amount}`, updatedAt: new Date() },
    })
    .returning({ totalXp: userXpBalances.totalXp });

  const newXp = balance?.totalXp ?? amount;
  const previousXp = newXp - amount;
  if (newXp < 0) throw new InsufficientXpError(previousXp, amount);

  await createNotificationIntent(tx, {
    projectId,
    userId,
    type: 'xp_awarded',
    data: { amount, reason },
    sourceType: 'xp_awarded',
    sourceId: entry.id,
  });

  await createWebhookDelivery(tx, {
    projectId,
    eventId: entry.id,
    eventType: 'xp.awarded',
    userId,
    data: { amount, newBalance: newXp, reason, ...input.webhookData },
  });

  const levelsCrossed = await announceLevelUps(tx, input, previousXp, newXp);
  return { duplicate: false, entry, previousXp, newXp, levelsCrossed };
}

async function announceLevelUps(
  tx: RewardTransaction,
  { projectId, userId }: AwardXpInput,
  previousXp: number,
  newXp: number
): Promise<number[]> {
  const projectLevels = await tx.select().from(levels).where(eq(levels.projectId, projectId));
  const activeLevels = projectLevels.filter((level) => level.enabled !== false);
  if (activeLevels.length === 0) return [];

  const crossed = getLevelsCrossed(previousXp, newXp, projectLevels);
  for (const levelNumber of crossed) {
    const definition = activeLevels.find((level) => level.level === levelNumber);
    const levelName = definition?.name ?? `Level ${levelNumber}`;
    const sourceId = generateLevelUpSourceId(projectId, userId, levelNumber);
    const data = { previousLevel: levelNumber - 1, newLevel: levelNumber, levelName };

    await createNotificationIntent(tx, {
      projectId,
      userId,
      type: 'level_up',
      data,
      sourceType: 'level_up',
      sourceId,
    });

    await createWebhookDelivery(tx, {
      projectId,
      eventId: sourceId,
      eventType: 'level.up',
      userId,
      data: { ...data, xp: newXp },
    });
  }

  return crossed;
}
