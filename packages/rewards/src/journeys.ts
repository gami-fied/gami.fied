import { randomUUID } from 'crypto';
import { challenges, db, journeyCompletions, journeys, userChallengeProgress, type Journey } from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, eq, inArray } from 'drizzle-orm';
import { describePrizes, grantPrizes, type Prize } from './prizes.js';

export interface JourneyStepState {
  challengeId: string;
  key: string;
  name: string;
  description: string | null;
  target: number;
  progress: number;
  completed: boolean;
  /** True until every step before this one is finished. */
  locked: boolean;
}

export interface JourneyState {
  journey: Journey;
  steps: JourneyStepState[];
  /** Every step is finished. */
  completed: boolean;
}

/**
 * Where a player stands in each of a project's journeys. A step is locked until the steps before
 * it are finished. A step whose challenge no longer exists is left out.
 */
export async function journeyStates(projectId: string, userId: string): Promise<JourneyState[]> {
  const list = await db
    .select()
    .from(journeys)
    .where(and(eq(journeys.projectId, projectId), eq(journeys.enabled, true)))
    .orderBy(journeys.createdAt, journeys.id);
  if (list.length === 0) return [];

  const keys = [...new Set(list.flatMap((journey) => journey.steps as string[]))];
  if (keys.length === 0) return list.map((journey) => ({ journey, steps: [], completed: false }));

  const stepChallenges = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.projectId, projectId), inArray(challenges.key, keys)));
  const byKey = new Map(stepChallenges.map((challenge) => [challenge.key, challenge]));
  const progress =
    stepChallenges.length === 0
      ? []
      : await db
          .select()
          .from(userChallengeProgress)
          .where(
            and(
              eq(userChallengeProgress.projectId, projectId),
              eq(userChallengeProgress.userId, userId),
              inArray(
                userChallengeProgress.challengeId,
                stepChallenges.map((challenge) => challenge.id)
              )
            )
          );

  return list.map((journey) => {
    let open = true;
    const steps: JourneyStepState[] = [];
    for (const key of journey.steps as string[]) {
      const challenge = byKey.get(key);
      if (!challenge) continue;
      const rows = progress.filter((row) => row.challengeId === challenge.id);
      const completed = rows.some((row) => row.completed);
      steps.push({
        challengeId: challenge.id,
        key,
        name: challenge.name,
        description: challenge.description,
        target: challenge.target,
        progress: completed ? challenge.target : Math.max(0, ...rows.map((row) => row.progress)),
        completed,
        locked: !open,
      });
      if (!completed) open = false;
    }
    return { journey, steps, completed: steps.length > 0 && steps.every((step) => step.completed) };
  });
}

/** The challenges this player cannot work on yet, because an earlier step of a journey is not finished. */
export async function lockedChallengeIds(projectId: string, userId: string): Promise<Set<string>> {
  const states = await journeyStates(projectId, userId);
  return new Set(states.flatMap((state) => state.steps.filter((step) => step.locked).map((step) => step.challengeId)));
}

/**
 * Pays the prizes of every journey the player has just finished. Each journey pays once per
 * player, so calling this again changes nothing.
 */
export async function completeFinishedJourneys(projectId: string, userId: string): Promise<number> {
  const finished = (await journeyStates(projectId, userId)).filter((state) => state.completed);
  let paid = 0;

  for (const { journey } of finished) {
    await db.transaction(async (tx) => {
      const [first] = await tx
        .insert(journeyCompletions)
        .values({ id: `jcp_${randomUUID()}`, projectId, userId, journeyId: journey.id })
        .onConflictDoNothing()
        .returning({ id: journeyCompletions.id });
      if (!first) return;

      const prizes = (journey.rewards ?? []) as Prize[];
      const source = `journey:${journey.id}:${userId}`;
      await grantPrizes(tx, { projectId, userId, prizes, reason: `Journey finished: ${journey.name}`, source, metadata: { journeyId: journey.id } });
      if (prizes.length > 0) {
        await createNotificationIntent(tx, {
          projectId,
          userId,
          type: 'prize_won',
          data: { title: `Journey finished: ${journey.name}`, prizes: describePrizes(prizes) },
          sourceType: 'journey_completed',
          sourceId: source,
        });
      }
      await createWebhookDelivery(tx, {
        projectId,
        eventId: source,
        eventType: 'journey.completed',
        userId,
        data: { journeyId: journey.id, journeyKey: journey.key, journeyName: journey.name, prizes },
      });
      paid++;
    });
  }
  return paid;
}
