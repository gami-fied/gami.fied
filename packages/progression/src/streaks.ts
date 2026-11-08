/**
 * Streak maths. Everything here is a pure function, so the rules for time zones, freezes and
 * resets can be tested without a database.
 *
 * A streak counts consecutive periods (days or weeks) in which a user did something. Periods
 * follow the user's local calendar, so activity at 23:30 in Tokyo and 00:30 the next morning
 * count as two different days no matter what time it is in UTC.
 */

export type StreakCadence = 'daily' | 'weekly';

export interface StreakSettings {
  cadence: StreakCadence;
  /** IANA time zone used when the user has none of their own. */
  timeZone: string;
  /** A freeze is earned every time the streak reaches a multiple of this. 0 turns freezes off. */
  freezeEvery: number;
  /** Most freezes a user can hold at once. */
  maxFreezes: number;
}

export interface StreakState {
  current: number;
  longest: number;
  /** Index of the last period with activity, from {@link periodIndex}. Null before the first. */
  lastPeriod: number | null;
  freezes: number;
}

export type StreakChange =
  /** First activity, or the first after a streak ended. */
  | 'started'
  /** Activity in the next period, so the streak grew. */
  | 'extended'
  /** More activity in a period that already counted. */
  | 'same_period'
  /** One or more missed periods were covered by freezes, and the streak grew. */
  | 'frozen'
  /** Periods were missed with no freezes left, so the streak restarted at 1. */
  | 'reset'
  /** Activity older than the latest counted period, which cannot change the streak. */
  | 'ignored';

export interface StreakUpdate {
  state: StreakState;
  change: StreakChange;
  /** Freezes spent covering missed periods. */
  freezesUsed: number;
  /** Freezes earned by this activity. */
  freezesEarned: number;
  /** The streak that ended, when `change` is `reset`. */
  brokenStreak: number;
}

export const EMPTY_STREAK: StreakState = { current: 0, longest: 0, lastPeriod: null, freezes: 0 };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Days since 1970-01-01 of the calendar date `at` falls on in `timeZone`. */
export function localDayIndex(at: Date, timeZone: string): number {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Math.floor(Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000);
}

/**
 * The number of the period `at` falls in. Days are counted from 1970-01-01, and weeks run from
 * Monday to Sunday, so consecutive periods always differ by exactly 1.
 */
export function periodIndex(at: Date, timeZone: string, cadence: StreakCadence): number {
  const day = localDayIndex(at, timeZone);
  // 1970-01-01 was a Thursday, so adding 3 lines weeks up with Monday.
  return cadence === 'weekly' ? Math.floor((day + 3) / 7) : day;
}

function earnedFreezes(before: number, after: number, settings: StreakSettings): number {
  if (settings.freezeEvery <= 0) return 0;
  return Math.floor(after / settings.freezeEvery) - Math.floor(before / settings.freezeEvery);
}

/** Records activity at `at` and returns the new state along with what changed. */
export function applyActivity(
  state: StreakState,
  at: Date,
  settings: StreakSettings,
  timeZone: string = settings.timeZone
): StreakUpdate {
  const period = periodIndex(at, timeZone, settings.cadence);
  const unchanged = (change: StreakChange): StreakUpdate => ({
    state,
    change,
    freezesUsed: 0,
    freezesEarned: 0,
    brokenStreak: 0,
  });

  if (state.lastPeriod !== null) {
    if (period === state.lastPeriod) return unchanged('same_period');
    if (period < state.lastPeriod) return unchanged('ignored');
  }

  const grow = (
    current: number,
    freezes: number,
    change: StreakChange,
    freezesUsed: number,
    brokenStreak = 0
  ): StreakUpdate => {
    const earned = earnedFreezes(current - 1, current, settings);
    const held = Math.min(settings.maxFreezes, freezes + earned);
    return {
      state: {
        current,
        longest: Math.max(state.longest, current),
        lastPeriod: period,
        freezes: held,
      },
      change,
      freezesUsed,
      freezesEarned: held - freezes,
      brokenStreak,
    };
  };

  if (state.lastPeriod === null || state.current === 0) return grow(1, state.freezes, 'started', 0);

  const missed = period - state.lastPeriod - 1;
  if (missed === 0) return grow(state.current + 1, state.freezes, 'extended', 0);

  if (state.freezes >= missed) {
    return grow(state.current + 1, state.freezes - missed, 'frozen', missed);
  }

  return grow(1, state.freezes, 'reset', 0, state.current);
}

export interface StreakStatus {
  /** The streak still counts: the user has not missed more periods than their freezes cover. */
  alive: boolean;
  /** Nothing has been done in the current period yet, so the streak ends if it passes empty. */
  atRisk: boolean;
  /** What the streak is worth right now. Zero once it can no longer be saved. */
  current: number;
}

/** Reads a stored streak at `now`, without waiting for the next activity to notice it ended. */
export function streakStatus(
  state: StreakState,
  now: Date,
  settings: StreakSettings,
  timeZone: string = settings.timeZone
): StreakStatus {
  if (state.lastPeriod === null || state.current === 0) {
    return { alive: false, atRisk: false, current: 0 };
  }

  const missed = periodIndex(now, timeZone, settings.cadence) - state.lastPeriod - 1;
  if (missed < 0) return { alive: true, atRisk: false, current: state.current };
  if (missed === 0) return { alive: true, atRisk: true, current: state.current };
  if (state.freezes >= missed) return { alive: true, atRisk: true, current: state.current };
  return { alive: false, atRisk: false, current: 0 };
}
