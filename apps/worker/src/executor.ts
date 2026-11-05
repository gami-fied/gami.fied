import crypto from 'crypto';
import { db, ruleExecutions } from '@gami/database';
import { ActionDefinition, evaluateRule, EventData } from '@gami/rules';
import { eq, and } from 'drizzle-orm';
import { executeAwardAchievementAction } from './actions/award-achievement.js';
import { executeAwardXpAction } from './actions/award-xp.js';

export interface DBConfiguredRule {
  id: string;
  projectId: string;
  name: string;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
}

export type RuleExecutionResult = { status: 'completed' | 'skipped' | 'failed'; error?: string };

async function ensureExecutionRecord(ruleId: string, eventId: string): Promise<string> {
  const id = `rex_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const [created] = await db
    .insert(ruleExecutions)
    .values({ id, ruleId, eventId, status: 'pending' })
    .onConflictDoNothing()
    .returning({ id: ruleExecutions.id });
  if (created) return created.id;

  // Another worker created it first, and ledger rows must point at the row that exists.
  const [existing] = await db
    .select({ id: ruleExecutions.id })
    .from(ruleExecutions)
    .where(and(eq(ruleExecutions.ruleId, ruleId), eq(ruleExecutions.eventId, eventId)));
  if (!existing) throw new Error(`Rule execution for ${ruleId} on ${eventId} could not be created`);
  return existing.id;
}

async function finishExecution(
  executionId: string,
  status: 'completed' | 'skipped' | 'failed',
  error: string | null = null
): Promise<void> {
  await db
    .update(ruleExecutions)
    .set({
      status,
      error,
      updatedAt: new Date(),
      ...(status === 'completed' ? { executedAt: new Date() } : {}),
    })
    .where(eq(ruleExecutions.id, executionId));
}

async function runAction(
  action: ActionDefinition,
  actionIndex: number,
  rule: DBConfiguredRule,
  eventData: EventData,
  ruleExecutionId: string
): Promise<void> {
  const context = { ruleId: rule.id, ruleExecutionId };

  if (action.type === 'award_xp') {
    await executeAwardXpAction(action, eventData, { ...context, actionIndex });
  } else if (action.type === 'award_achievement') {
    await executeAwardAchievementAction(action, eventData, context);
  } else {
    throw new Error(`Unsupported action type: ${action.type}`);
  }
}

export async function executeRuleForEvent(
  rule: DBConfiguredRule,
  eventData: EventData
): Promise<RuleExecutionResult> {
  // 1. Idempotency Check: a finished rule is never run twice for the same event
  const [existingExecution] = await db
    .select()
    .from(ruleExecutions)
    .where(and(eq(ruleExecutions.ruleId, rule.id), eq(ruleExecutions.eventId, eventData.id)));

  if (existingExecution?.status === 'completed' || existingExecution?.status === 'skipped') {
    console.log(
      `[RuleExecutor] Idempotency skip: Rule ${rule.id} already finished for event ${eventData.id}`
    );
    return { status: 'skipped' };
  }

  const executionId =
    existingExecution?.id ?? (await ensureExecutionRecord(rule.id, eventData.id));

  try {
    // 2. Evaluate Rule via @gami/rules engine
    const evalResult = evaluateRule(
      {
        trigger: rule.trigger,
        conditions: rule.conditions || undefined,
        actions: rule.actions || [],
      },
      eventData,
      rule.id
    );

    if (evalResult.error) {
      await finishExecution(executionId, 'failed', evalResult.error);
      return { status: 'failed', error: evalResult.error };
    }

    if (!evalResult.matched) {
      await finishExecution(executionId, 'skipped');
      return { status: 'skipped' };
    }

    console.log(
      `[RuleExecutor] Rule ${rule.id} (${rule.name}) MATCHED event ${eventData.id}. Executing ${evalResult.actions.length} action(s)...`
    );

    // 3. Each action fails on its own, and a retry only re-runs what did not finish
    let lastActionError: string | undefined;
    for (const [actionIndex, action] of evalResult.actions.entries()) {
      try {
        await runAction(action, actionIndex, rule, eventData, executionId);
      } catch (actionErr: unknown) {
        lastActionError = (actionErr as Error).message || `Action ${action.type} failed`;
        console.error(
          `[RuleExecutor] Action ${action.type} failed in rule ${rule.id}: ${lastActionError}`
        );
      }
    }

    // 4. Record the outcome
    if (lastActionError) {
      await finishExecution(executionId, 'failed', lastActionError);
      return { status: 'failed', error: lastActionError };
    }

    await finishExecution(executionId, 'completed');
    console.log(`[RuleExecutor] Rule ${rule.id} successfully executed for event ${eventData.id}`);
    return { status: 'completed' };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Rule execution failed';
    console.error(
      `[RuleExecutor] Error executing rule ${rule.id} on event ${eventData.id}: ${errorMsg}`
    );
    await finishExecution(executionId, 'failed', errorMsg);
    return { status: 'failed', error: errorMsg };
  }
}
