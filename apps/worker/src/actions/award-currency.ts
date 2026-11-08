import { db } from '@gami/database';
import { creditWallet, findCurrency } from '@gami/rewards';
import { ActionDefinition, EventData } from '@gami/rules';

/** Gives points in a currency such as coins. Each rule run and action gives them once. */
export async function executeAwardCurrencyAction(
  action: ActionDefinition,
  event: EventData,
  context: { ruleId: string; ruleExecutionId: string; actionIndex: number }
): Promise<{ status: 'completed' | 'skipped' }> {
  const params = action.params as { currency?: string; amount?: number; reason?: string } | undefined;
  if (!params || typeof params.currency !== 'string' || !Number.isInteger(params.amount) || (params.amount as number) <= 0) {
    throw new Error('award_currency needs a currency key and a positive whole amount');
  }
  if (!event.userId) throw new Error('award_currency needs an event with a user');
  const userId = event.userId;

  const result = await db.transaction(async (tx) => {
    const currency = await findCurrency(tx, event.projectId, params.currency as string);
    return creditWallet(tx, currency, {
      projectId: event.projectId,
      userId,
      amount: params.amount as number,
      reason: params.reason || `Rule ${context.ruleId}`,
      kind: 'earn',
      metadata: { ruleId: context.ruleId, eventId: event.id },
      // The same rule run cannot pay twice if the event is processed again.
      idempotencyKey: `rule:${context.ruleExecutionId}:${context.actionIndex}`,
    });
  });
  return { status: result.duplicate ? 'skipped' : 'completed' };
}
