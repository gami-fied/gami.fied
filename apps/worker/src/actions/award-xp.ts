import crypto from 'crypto';
import { db, userXpBalances, xpLedger } from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { ActionDefinition, defaultActionRegistry, EventData } from '@gami/rules';
import { sql } from 'drizzle-orm';

export const MAX_XP_PER_ACTION = 1_000_000;

export interface AwardXpParams {
  amount: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RuleExecutionContext {
  ruleId: string;
  ruleExecutionId: string;
}

export async function executeAwardXpAction(
  action: ActionDefinition,
  event: EventData,
  context?: RuleExecutionContext
): Promise<{ status: 'completed' | 'skipped' }> {
  const params = action.params as AwardXpParams | undefined;

  if (!params || typeof params.amount !== 'number') {
    throw new Error('award_xp action requires a valid numeric amount parameter');
  }

  const { amount } = params;

  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_XP_PER_ACTION) {
    throw new Error(
      `award_xp amount must be a positive integer between 1 and ${MAX_XP_PER_ACTION}`
    );
  }

  if (!event.userId) {
    throw new Error('award_xp action requires event to have a valid user_id context');
  }

  if (!context?.ruleExecutionId || !context?.ruleId) {
    throw new Error('award_xp action requires non-null ruleExecutionId and ruleId context');
  }

  const reason = params.reason || `Rule ${context.ruleId} execution`;
  const metadata = params.metadata || {};
  const ledgerId = `xpl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const balanceId = `xpb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    // Atomic Database Transaction for XP Ledger + Balance Update
    await db.transaction(async (tx) => {
      // 1. Insert immutable XP Ledger entry
      await tx.insert(xpLedger).values({
        id: ledgerId,
        projectId: event.projectId,
        userId: event.userId!,
        eventId: event.id,
        ruleId: context.ruleId,
        ruleExecutionId: context.ruleExecutionId,
        amount,
        reason,
        metadata,
      });

      // 2. Upsert user_xp_balances (total_xp = total_xp + amount)
      const [upsertedBalance] = await tx
        .insert(userXpBalances)
        .values({
          id: balanceId,
          projectId: event.projectId,
          userId: event.userId!,
          totalXp: amount,
        })
        .onConflictDoUpdate({
          target: [userXpBalances.projectId, userXpBalances.userId],
          set: {
            totalXp: sql`user_xp_balances.total_xp + ${amount}`,
            updatedAt: new Date(),
          },
        })
        .returning();

      const newBalance = upsertedBalance ? upsertedBalance.totalXp : amount;

      // 3. Create xp.awarded webhook outbox intent
      await createWebhookDelivery(tx, {
        projectId: event.projectId,
        eventId: ledgerId,
        eventType: 'xp.awarded',
        userId: event.userId!,
        data: {
          amount,
          newBalance,
          reason,
          ruleId: context.ruleId,
          ruleExecutionId: context.ruleExecutionId,
        },
      });
    });

    console.log(
      `[award_xp] Successfully awarded ${amount} XP to user ${event.userId} for project ${event.projectId}`
    );
    return { status: 'completed' };
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Handle duplicate ruleExecutionId constraint (23505) explicitly as idempotent skip
    if (error.code === '23505') {
      console.log(
        `[award_xp] Idempotent skip: XP already awarded for rule execution ${context.ruleExecutionId}`
      );
      return { status: 'skipped' };
    }
    throw err;
  }
}

export function registerXpActions(): void {
  defaultActionRegistry.register('award_xp', async (action, event) => {
    // Standard execution via registry
    await executeAwardXpAction(action, event);
  });
}
