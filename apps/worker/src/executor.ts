import crypto from 'crypto';
import { db, ruleExecutions } from '@gami/database';
import { ActionDefinition, evaluateRule, EventData, getPluginAction } from '@gami/rules';
import { eq, and } from 'drizzle-orm';
import { executeAwardAchievementAction } from './actions/award-achievement.js';
import { executeAwardCurrencyAction } from './actions/award-currency.js';
import { executeAwardXpAction } from './actions/award-xp.js';
import { computeAggregates } from './aggregates.js';
import { createLogger } from '@gami/config';

const log = createLogger('RuleExecutor');

/** The fields that tie a log line to one event, rule and project. */
const ids = (rule: { id: string; name: string }, event: { id: string; projectId: string }) => ({
  eventId: event.id,
  projectId: event.projectId,
  ruleId: rule.id,
  ruleName: rule.name,
});

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
  } else if (action.type === 'award_currency') {
    await executeAwardCurrencyAction(action, eventData, { ...context, actionIndex });
  } else {
    const plugin = getPluginAction(action.type);
    if (!plugin) throw new Error(`Unsupported action type: ${action.type}`);
    await plugin.run({
      projectId: eventData.projectId,
      userId: eventData.userId ?? null,
      event: eventData,
      params: action.params ?? {},
      ruleId: rule.id,
      idempotencyKey: `rule:${ruleExecutionId}:${actionIndex}`,
    });
  }
}

export async function executeRuleForEvent(
  rule: DBConfiguredRule,
  eventData: EventData,
  options: { replay?: boolean } = {}
): Promise<RuleExecutionResult> {
  // 1. Idempotency Check: a completed rule never runs twice for the same event. A replay does
  // look again at rules that did not match, because the rule may have been edited since.
  const [existingExecution] = await db
    .select()
    .from(ruleExecutions)
    .where(and(eq(ruleExecutions.ruleId, rule.id), eq(ruleExecutions.eventId, eventData.id)));

  const finished =
    existingExecution?.status === 'completed' ||
    (existingExecution?.status === 'skipped' && !options.replay);

  if (finished) {
    log.info('Rule already finished for this event, skipping', ids(rule, eventData));
    return { status: 'skipped' };
  }

  const executionId =
    existingExecution?.id ?? (await ensureExecutionRecord(rule.id, eventData.id));

  try {
    // 2. Evaluate Rule via @gami/rules engine
    const aggregates = await computeAggregates(rule.conditions, eventData);
    const evalResult = evaluateRule(
      {
        trigger: rule.trigger,
        conditions: rule.conditions || undefined,
        actions: rule.actions || [],
      },
      eventData,
      rule.id,
      aggregates
    );

    if (evalResult.error) {
      await finishExecution(executionId, 'failed', evalResult.error);
      return { status: 'failed', error: evalResult.error };
    }

    if (!evalResult.matched) {
      await finishExecution(executionId, 'skipped');
      return { status: 'skipped' };
    }

    log.info('Rule matched, running its actions', {
      ...ids(rule, eventData),
      actions: evalResult.actions.length,
    });

    // 3. Each action fails on its own, and a retry only re-runs what did not finish
    let lastActionError: string | undefined;
    for (const [actionIndex, action] of evalResult.actions.entries()) {
      try {
        await runAction(action, actionIndex, rule, eventData, executionId);
      } catch (actionErr: unknown) {
        lastActionError = (actionErr as Error).message || `Action ${action.type} failed`;
        log.error('Action failed', {
          ...ids(rule, eventData),
          action: action.type,
          actionIndex,
          error: lastActionError,
        });
      }
    }

    // 4. Record the outcome
    if (lastActionError) {
      await finishExecution(executionId, 'failed', lastActionError);
      return { status: 'failed', error: lastActionError };
    }

    await finishExecution(executionId, 'completed');
    log.info('Rule completed', ids(rule, eventData));
    return { status: 'completed' };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Rule execution failed';
    log.error('Rule failed', { ...ids(rule, eventData), error: errorMsg });
    await finishExecution(executionId, 'failed', errorMsg);
    return { status: 'failed', error: errorMsg };
  }
}
