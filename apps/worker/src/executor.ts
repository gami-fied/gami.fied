import crypto from 'crypto';
import { db, levels, ruleExecutions, userXpBalances, xpLedger } from '@gami/database';
import { createNotificationIntent, generateLevelUpSourceId } from '@gami/notifications';
import { getLevelsCrossed } from '@gami/progression';
import { defaultActionRegistry, evaluateRule, EventData } from '@gami/rules';
import { eq, and, sql } from 'drizzle-orm';
import { executeAwardAchievementAction } from './actions/award-achievement.js';
import { AwardXpParams, MAX_XP_PER_ACTION } from './actions/award-xp.js';

export interface DBConfiguredRule {
  id: string;
  projectId: string;
  name: string;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
}

export async function executeRuleForEvent(
  rule: DBConfiguredRule,
  eventData: EventData
): Promise<{ status: 'completed' | 'skipped' | 'failed'; error?: string }> {
  // 1. Idempotency Check: check if rule_executions record already exists for (rule_id, event_id)
  const [existingExecution] = await db
    .select()
    .from(ruleExecutions)
    .where(and(eq(ruleExecutions.ruleId, rule.id), eq(ruleExecutions.eventId, eventData.id)));

  if (existingExecution && existingExecution.status === 'completed') {
    console.log(
      `[RuleExecutor] Idempotency skip: Rule ${rule.id} already completed for event ${eventData.id}`
    );
    return { status: 'skipped' };
  }

  const executionId =
    existingExecution?.id || `rex_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  if (!existingExecution) {
    await db
      .insert(ruleExecutions)
      .values({
        id: executionId,
        ruleId: rule.id,
        eventId: eventData.id,
        status: 'pending',
      })
      .onConflictDoNothing();
  }

  try {
    // 2. Evaluate Rule via @gami/rules engine
    const rawRuleDef = {
      trigger: rule.trigger,
      conditions: rule.conditions || undefined,
      actions: rule.actions || [],
    };

    const evalResult = evaluateRule(rawRuleDef, eventData, rule.id);

    if (!evalResult.matched) {
      console.log(
        `[RuleExecutor] Rule ${rule.id} (${rule.name}) did not match event ${eventData.id}`
      );
      await db
        .update(ruleExecutions)
        .set({ status: 'failed', error: 'Conditions did not match', updatedAt: new Date() })
        .where(eq(ruleExecutions.id, executionId));

      return { status: 'skipped' };
    }

    console.log(
      `[RuleExecutor] Rule ${rule.id} (${rule.name}) MATCHED event ${eventData.id}. Executing ${evalResult.actions.length} action(s)...`
    );

    let hasActionError = false;
    let lastActionErrorMessage = '';

    // 3. Independent Action Execution Loop (Failure Isolation per Action)
    for (const actionDef of evalResult.actions) {
      try {
        if (actionDef.type === 'award_xp') {
          const params = actionDef.params as AwardXpParams | undefined;
          if (!params || typeof params.amount !== 'number') {
            throw new Error('award_xp action requires a valid numeric amount parameter');
          }
          if (
            !Number.isInteger(params.amount) ||
            params.amount <= 0 ||
            params.amount > MAX_XP_PER_ACTION
          ) {
            throw new Error(
              `award_xp amount must be a positive integer between 1 and ${MAX_XP_PER_ACTION}`
            );
          }
          if (!eventData.userId) {
            throw new Error('award_xp action requires event to have a valid user_id context');
          }

          const reason = params.reason || `Rule ${rule.id} execution`;
          const metadata = params.metadata || {};
          const ledgerId = `xpl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const balanceId = `xpb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

          await db.transaction(async (tx) => {
            await tx.insert(xpLedger).values({
              id: ledgerId,
              projectId: eventData.projectId,
              userId: eventData.userId!,
              eventId: eventData.id,
              ruleId: rule.id,
              ruleExecutionId: executionId,
              amount: params.amount,
              reason,
              metadata,
            });

            const [upsertedBalance] = await tx
              .insert(userXpBalances)
              .values({
                id: balanceId,
                projectId: eventData.projectId,
                userId: eventData.userId!,
                totalXp: params.amount,
              })
              .onConflictDoUpdate({
                target: [userXpBalances.projectId, userXpBalances.userId],
                set: {
                  totalXp: sql`user_xp_balances.total_xp + ${params.amount}`,
                  updatedAt: new Date(),
                },
              })
              .returning();

            const newXp = upsertedBalance ? upsertedBalance.totalXp : params.amount;
            const previousXp = Math.max(0, newXp - params.amount);

            // 1. Create xp_awarded notification intent in SAME transaction
            await createNotificationIntent(tx, {
              projectId: eventData.projectId,
              userId: eventData.userId!,
              type: 'xp_awarded',
              data: { amount: params.amount, reason },
              sourceType: 'xp_awarded',
              sourceId: ledgerId,
            });

            // 2. Calculate level transitions using previousXp & newXp in SAME transaction
            const projectLevels = await tx
              .select()
              .from(levels)
              .where(eq(levels.projectId, eventData.projectId));

            if (projectLevels.length > 0) {
              const crossed = getLevelsCrossed(previousXp, newXp, projectLevels);
              const activeLevelsSorted = projectLevels
                .filter((l) => l.enabled !== false)
                .sort((a, b) => a.level - b.level);

              for (const lvlNumber of crossed) {
                const lvlDef = activeLevelsSorted.find((l) => l.level === lvlNumber);
                const levelName = lvlDef ? lvlDef.name : `Level ${lvlNumber}`;
                const sourceId = generateLevelUpSourceId(
                  eventData.projectId,
                  eventData.userId!,
                  lvlNumber
                );

                await createNotificationIntent(tx, {
                  projectId: eventData.projectId,
                  userId: eventData.userId!,
                  type: 'level_up',
                  data: {
                    previousLevel: lvlNumber - 1,
                    newLevel: lvlNumber,
                    levelName,
                  },
                  sourceType: 'level_up',
                  sourceId,
                });
              }
            }
          });
        } else if (actionDef.type === 'award_achievement') {
          await executeAwardAchievementAction(actionDef, eventData, {
            ruleId: rule.id,
            ruleExecutionId: executionId,
          });
        } else {
          await defaultActionRegistry.execute(actionDef, eventData);
        }
      } catch (actionErr: unknown) {
        const error = actionErr as { code?: string; message?: string };
        // If duplicate constraint (23505), treat as idempotent skip
        if (error.code === '23505') {
          console.log(
            `[RuleExecutor] Action ${actionDef.type} duplicate constraint skipped cleanly for rule ${rule.id}`
          );
        } else {
          hasActionError = true;
          lastActionErrorMessage = error.message || `Action ${actionDef.type} failed`;
          console.error(
            `[RuleExecutor] Action ${actionDef.type} failed in rule ${rule.id}: ${lastActionErrorMessage}`
          );
        }
      }
    }

    // 4. Mark Rule Execution status in database based on action loop result
    if (hasActionError) {
      await db
        .update(ruleExecutions)
        .set({
          status: 'failed',
          error: lastActionErrorMessage,
          updatedAt: new Date(),
        })
        .where(eq(ruleExecutions.id, executionId));

      return { status: 'failed', error: lastActionErrorMessage };
    }

    await db
      .update(ruleExecutions)
      .set({
        status: 'completed',
        executedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ruleExecutions.id, executionId));

    console.log(`[RuleExecutor] Rule ${rule.id} successfully executed for event ${eventData.id}`);
    return { status: 'completed' };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Rule execution failed';
    console.error(
      `[RuleExecutor] Error executing rule ${rule.id} on event ${eventData.id}: ${errorMsg}`
    );

    await db
      .update(ruleExecutions)
      .set({
        status: 'failed',
        error: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(ruleExecutions.id, executionId));

    return { status: 'failed', error: errorMsg };
  }
}
