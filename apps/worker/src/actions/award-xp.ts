import { db } from '@gami/database';
import { ActionDefinition, EventData, MAX_XP_PER_ACTION } from '@gami/rules';
import { awardXp } from '@gami/rewards';
import { applyXpPolicy, recordLimitHits } from '../xp-policy.js';

export interface AwardXpParams {
  amount: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RuleExecutionContext {
  ruleId: string;
  ruleExecutionId: string;
  actionIndex: number;
}

export async function executeAwardXpAction(
  action: ActionDefinition,
  event: EventData,
  context: RuleExecutionContext
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

  const userId = event.userId;
  if (!userId) {
    throw new Error('award_xp action requires event to have a valid user_id context');
  }

  const { ruleId, ruleExecutionId, actionIndex } = context;

  const result = await db.transaction(async (tx) => {
    // Promotions and limits decide what the rule's XP is worth for this person right now.
    const policy = await applyXpPolicy(tx, {
      projectId: event.projectId,
      userId,
      eventType: event.type,
      ruleId,
      eventId: event.id,
      amount,
      occurredAt: new Date(event.occurredAt),
    });
    if (policy.amount <= 0) {
      await recordLimitHits(tx, { projectId: event.projectId, userId, eventType: event.type, ruleId, eventId: event.id, amount, occurredAt: new Date(event.occurredAt) }, policy.wanted, policy.hits);
      return { duplicate: true as const };
    }

    const awarded = await awardXp(tx, {
      projectId: event.projectId,
      userId,
      amount: policy.amount,
      reason: params.reason || `Rule ${ruleId} execution`,
      metadata: {
        ...params.metadata,
        ...(policy.boost || policy.amount !== amount ? { baseAmount: amount } : {}),
        ...(policy.boost ? { boost: policy.boost } : {}),
      },
      eventId: event.id,
      ruleId,
      ruleExecutionId,
      actionIndex,
      webhookData: { ruleId, ruleExecutionId },
    });
    if (!awarded.duplicate && policy.hits.length > 0) {
      await recordLimitHits(tx, { projectId: event.projectId, userId, eventType: event.type, ruleId, eventId: event.id, amount, occurredAt: new Date(event.occurredAt) }, policy.wanted, policy.hits);
    }
    return awarded;
  });

  return { status: result.duplicate ? 'skipped' : 'completed' };
}
