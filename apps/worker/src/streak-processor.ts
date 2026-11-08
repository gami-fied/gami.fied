import crypto from 'crypto';
import { createLogger } from '@gami/config';
import {
  db,
  endUsers,
  eventOutbox,
  events,
  streakDefinitions,
  streakHistory,
  userStreaks,
} from '@gami/database';
import {
  applyActivity,
  isValidTimeZone,
  type StreakCadence,
  type StreakState,
} from '@gami/progression';
import type { EventData } from '@gami/rules';
import { and, eq } from 'drizzle-orm';

const log = createLogger('Streaks');

/**
 * Emitted every time a streak starts, grows, is saved by a freeze, or ends. It goes through the
 * normal event pipeline, so rules can award XP or badges on it, for example "streak_updated where
 * payload.streak is daily_lesson and payload.current is 7".
 */
export const STREAK_EVENT_TYPE = 'streak_updated';

const newId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

/** An IANA zone from the event, then the user's profile, or nothing. */
function zoneFrom(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (typeof source === 'string' && isValidTimeZone(source)) return source;
  }
  return null;
}

/**
 * Counts an event toward every enabled streak that listens for its type. Safe to run again for
 * the same event: activity is placed by when it happened, so a repeat lands in a period that
 * already counted and changes nothing.
 */
export async function processStreaksForEvent(event: EventData): Promise<number> {
  // The event a streak emits must never feed a streak, or the two would loop.
  if (!event.userId || event.type === STREAK_EVENT_TYPE) return 0;

  const definitions = await db
    .select()
    .from(streakDefinitions)
    .where(
      and(
        eq(streakDefinitions.projectId, event.projectId),
        eq(streakDefinitions.triggerEvent, event.type),
        eq(streakDefinitions.enabled, true)
      )
    );
  if (definitions.length === 0) return 0;

  const [user] = await db
    .select({ id: endUsers.id, metadata: endUsers.metadata })
    .from(endUsers)
    .where(and(eq(endUsers.projectId, event.projectId), eq(endUsers.id, event.userId)));
  if (!user) return 0;

  const profileZone = (user.metadata as Record<string, unknown> | null)?.['timezone'];
  const eventZone = event.payload?.['timezone'];
  let changed = 0;
  const occurredAt = new Date(event.occurredAt);

  for (const definition of definitions) {
    const settings = {
      cadence: definition.cadence as StreakCadence,
      timeZone: definition.timeZone,
      freezeEvery: definition.freezeEvery,
      maxFreezes: definition.maxFreezes,
    };

    await db.transaction(async (tx) => {
      await tx
        .insert(userStreaks)
        .values({
          id: newId('stk'),
          projectId: event.projectId,
          userId: user.id,
          definitionId: definition.id,
        })
        .onConflictDoNothing();

      const [row] = await tx
        .select()
        .from(userStreaks)
        .where(
          and(
            eq(userStreaks.projectId, event.projectId),
            eq(userStreaks.userId, user.id),
            eq(userStreaks.definitionId, definition.id)
          )
        )
        .for('update');
      if (!row) return;

      const state: StreakState = {
        current: row.current,
        longest: row.longest,
        lastPeriod: row.lastPeriod,
        freezes: row.freezes,
      };
      const timeZone = zoneFrom(eventZone, profileZone, row.timeZone) ?? definition.timeZone;
      const update = applyActivity(state, occurredAt, settings, timeZone);
      if (update.change === 'same_period' || update.change === 'ignored') return;

      await tx
        .update(userStreaks)
        .set({
          current: update.state.current,
          longest: update.state.longest,
          lastPeriod: update.state.lastPeriod,
          freezes: update.state.freezes,
          timeZone,
          lastActivityAt: occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(userStreaks.id, row.id));

      await tx.insert(streakHistory).values({
        id: newId('skh'),
        projectId: event.projectId,
        userId: user.id,
        definitionId: definition.id,
        eventId: event.id,
        change: update.change,
        current: update.state.current,
        freezesUsed: update.freezesUsed,
        freezesEarned: update.freezesEarned,
        brokenStreak: update.brokenStreak,
      });

      const derivedId = `evt_${crypto.randomUUID()}`;
      const [derived] = await tx
        .insert(events)
        .values({
          id: derivedId,
          projectId: event.projectId,
          userId: user.id,
          type: STREAK_EVENT_TYPE,
          payload: {
            streak: definition.key,
            streakId: definition.id,
            cadence: definition.cadence,
            change: update.change,
            current: update.state.current,
            longest: update.state.longest,
            freezes: update.state.freezes,
            freezesUsed: update.freezesUsed,
            freezesEarned: update.freezesEarned,
            brokenStreak: update.brokenStreak,
            sourceEventId: event.id,
          },
          // One per source event and streak, so replaying the source cannot emit it twice.
          idempotencyKey: `streak:${definition.id}:${event.id}`,
          occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (derived) {
        await tx.insert(eventOutbox).values({
          id: newId('out'),
          eventId: derived.id,
          status: 'pending',
        });
      }

      changed++;
      log.info('Streak updated', {
        eventId: event.id,
        projectId: event.projectId,
        streak: definition.key,
        change: update.change,
        current: update.state.current,
      });
    });
  }

  return changed;
}
