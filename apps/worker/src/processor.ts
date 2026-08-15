import { db, events, rules } from '@gami/database';
import { EventData } from '@gami/rules';
import { and, asc, eq } from 'drizzle-orm';
import { executeRuleForEvent } from './executor.js';
import { dispatchPendingNotifications } from './notification-dispatcher.js';
import {
  dispatchPendingChallengeRewards,
  processChallengesForEvent,
} from './challenge-processor.js';

export async function processEventJob(eventId: string): Promise<{
  eventId: string;
  processedRulesCount: number;
  completedRulesCount: number;
}> {
  // 1. Load canonical event
  const [evt] = await db.select().from(events).where(eq(events.id, eventId));

  if (!evt) {
    console.warn(`[Processor] Warning: Event ${eventId} not found in database. Skipping job.`);
    return {
      eventId,
      processedRulesCount: 0,
      completedRulesCount: 0,
    };
  }

  const eventData: EventData = {
    id: evt.id,
    projectId: evt.projectId,
    userId: evt.userId,
    type: evt.type,
    payload: (evt.payload as Record<string, unknown>) || {},
    occurredAt: evt.occurredAt,
  };

  // 2. Load enabled rules strictly scoped to event.projectId, ordered by created_at ASC, id ASC
  const projectRules = await db
    .select()
    .from(rules)
    .where(and(eq(rules.projectId, evt.projectId), eq(rules.enabled, true)))
    .orderBy(asc(rules.createdAt), asc(rules.id));

  console.log(
    `[Processor] Processing event ${evt.id} (${evt.type}) for project ${evt.projectId}. Evaluating ${projectRules.length} enabled rules...`
  );

  let completedCount = 0;

  // 3. Evaluate each rule with Failure Isolation
  for (const rule of projectRules) {
    const res = await executeRuleForEvent(rule, eventData);
    if (res.status === 'completed') {
      completedCount++;
    }
  }

  // 4. Process challenges for event with Failure Isolation & Outbox Dispatch
  try {
    await processChallengesForEvent(eventData);
    await dispatchPendingChallengeRewards(50);
  } catch (chErr) {
    console.error(`[Processor] Error processing challenges for event ${evt.id}:`, chErr);
  }

  // 5. Dispatch pending notifications with Failure Isolation
  try {
    await dispatchPendingNotifications(50);
  } catch (notifErr) {
    console.error(`[Processor] Error dispatching notifications for event ${evt.id}:`, notifErr);
  }

  return {
    eventId: evt.id,
    processedRulesCount: projectRules.length,
    completedRulesCount: completedCount,
  };
}
