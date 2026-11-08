import { db, events, projects, rules } from '@gami/database';
import { EventData } from '@gami/rules';
import { and, asc, eq } from 'drizzle-orm';
import { executeRuleForEvent } from './executor.js';
import { dispatchPendingNotifications } from './notification-dispatcher.js';
import {
  dispatchPendingChallengeRewards,
  processChallengesForEvent,
} from './challenge-processor.js';
import { createLogger } from '@gami/config';
import { publishRealtime } from '@gami/queue';
import { processStreaksForEvent } from './streak-processor.js';
import { processAchievementCriteriaForEvent } from './achievement-progress.js';
import { joinLeaguesForUser } from '@gami/leaderboards';
import { qualifyReferral } from '@gami/rewards';
import { featuresFor } from '@gami/database';
import { checkVelocity } from './abuse.js';

const log = createLogger('Processor');

export async function processEventJob(
  eventId: string,
  options: { replay?: boolean } = {}
): Promise<{
  eventId: string;
  processedRulesCount: number;
  completedRulesCount: number;
}> {
  // 1. Load canonical event
  const [evt] = await db.select().from(events).where(eq(events.id, eventId));

  if (!evt) {
    log.warn('Event not found, skipping job', { eventId });
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

  // 2. Load enabled rules for this event type, scoped to event.projectId, oldest first
  const projectRules = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.projectId, evt.projectId),
        eq(rules.enabled, true),
        eq(rules.trigger, evt.type)
      )
    )
    .orderBy(asc(rules.createdAt), asc(rules.id));

  const eventLog = log.child({ eventId: evt.id, projectId: evt.projectId });
  eventLog.info('Processing event', { type: evt.type, rules: projectRules.length });

  let completedCount = 0;

  // 3. Evaluate each rule with Failure Isolation
  for (const rule of projectRules) {
    const res = await executeRuleForEvent(rule, eventData, options);
    if (res.status === 'completed') {
      completedCount++;
    }
  }

  // Features the administrator turned off for this organization are skipped.
  const on = await featuresFor(await organizationOfProject(evt.projectId));

  // 4. Count the event toward streaks, with failure isolation
  try {
    if (on.streaks) await processStreaksForEvent(eventData);
  } catch (streakErr) {
    eventLog.error('Streak processing failed', streakErr);
  }

  // 5. Move achievements that measure progress themselves, with failure isolation
  try {
    if (on.achievements) await processAchievementCriteriaForEvent(eventData);
  } catch (achievementErr) {
    eventLog.error('Achievement progress failed', achievementErr);
  }

  // An invite counts once the new player sends the program's qualifying event.
  if (evt.userId) {
    try {
      if (on.referrals) await qualifyReferral(evt.projectId, evt.userId, evt.type);
    } catch (referralErr) {
      eventLog.error('Referral check failed', referralErr);
    }
  }

  // 6. Process challenges for event with Failure Isolation & Outbox Dispatch
  try {
    if (on.challenges) {
      await processChallengesForEvent(eventData);
      await dispatchPendingChallengeRewards(50);
    }
  } catch (chErr) {
    eventLog.error('Challenge processing failed', chErr);
  }

  // Someone earning or sending events unusually fast is flagged for review.
  if (evt.userId && on.boosts_limits) {
    try {
      await checkVelocity(evt.projectId, evt.userId);
    } catch (abuseErr) {
      eventLog.error('Velocity check failed', abuseErr);
    }
  }

  // A player who earned XP this season takes their place in each league.
  if (evt.userId) {
    try {
      if (on.leagues) await joinLeaguesForUser(evt.projectId, evt.userId);
    } catch (leagueErr) {
      eventLog.error('League placement failed', leagueErr);
    }
  }

  // 7. Dispatch pending notifications with Failure Isolation
  try {
    await dispatchPendingNotifications(50);
  } catch (notifErr) {
    eventLog.error('Notification dispatch failed', notifErr);
  }

  // Let open streams know there is something new to read. It never blocks or fails the event.
  if (on.realtime) void publishRealtime({ projectId: evt.projectId, userId: evt.userId });

  return {
    eventId: evt.id,
    processedRulesCount: projectRules.length,
    completedRulesCount: completedCount,
  };
}

async function organizationOfProject(projectId: string): Promise<string | null> {
  const [row] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  return row?.organizationId ?? null;
}
