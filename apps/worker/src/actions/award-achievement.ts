import { db } from '@gami/database';
import { grantAchievement } from '@gami/rewards';
import { ActionDefinition, EventData } from '@gami/rules';

export interface AwardAchievementParams {
  achievementKey: string;
  metadata?: Record<string, unknown>;
}

export interface RuleExecutionContext {
  ruleId: string;
  ruleExecutionId: string;
}

export async function executeAwardAchievementAction(
  action: ActionDefinition,
  event: EventData,
  context?: RuleExecutionContext
): Promise<{ status: 'completed' | 'skipped' }> {
  const params = action.params as AwardAchievementParams | undefined;

  if (!params || typeof params.achievementKey !== 'string') {
    throw new Error('award_achievement action requires a valid string achievementKey parameter');
  }

  const { achievementKey } = params;
  if (!achievementKey || achievementKey.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(achievementKey)) {
    throw new Error(
      'award_achievement achievementKey must be 1 to 64 alphanumeric characters, underscores, or dashes'
    );
  }

  const userId = event.userId;
  if (!userId) {
    throw new Error('award_achievement action requires event to have a valid user_id context');
  }

  const result = await db.transaction((tx) =>
    grantAchievement(tx, {
      projectId: event.projectId,
      userId,
      achievementKey,
      metadata: params.metadata,
      eventId: event.id,
      ruleExecutionId: context?.ruleExecutionId,
    })
  );

  return { status: result.duplicate ? 'skipped' : 'completed' };
}
