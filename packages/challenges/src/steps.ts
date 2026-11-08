import type { ChallengeFilter, ChallengeRecurrence, ChallengeStep } from './types.js';

export const MAX_STEPS = 10;
export const MAX_FILTERS = 10;

const DAY_MS = 86_400_000;

function utcDay(at: Date): number {
  return Math.floor(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / DAY_MS);
}

/** The Monday on or before `at`, as a UTC day number. */
function weekStartDay(at: Date): number {
  const day = utcDay(at);
  // 1970-01-01 was a Thursday, so adding 3 lines weeks up with Monday.
  return day - ((day + 3) % 7);
}

/**
 * Which period a moment falls in: `2026-11-08` for daily, `2026-11-02` (the Monday) for weekly,
 * or an empty string when the challenge does not repeat.
 */
export function periodKey(recurrence: ChallengeRecurrence | null | undefined, at: Date): string {
  if (!recurrence) return '';
  const day = recurrence === 'weekly' ? weekStartDay(at) : utcDay(at);
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** When the period containing `at` ends, so a dashboard can say "resets in 5 hours". */
export function periodEnd(recurrence: ChallengeRecurrence | null | undefined, at: Date): Date | null {
  if (!recurrence) return null;
  const startDay = recurrence === 'weekly' ? weekStartDay(at) : utcDay(at);
  return new Date((startDay + (recurrence === 'weekly' ? 7 : 1)) * DAY_MS);
}

/** Every event type that can move a challenge. */
export function challengeEvents(challenge: {
  trigger: string;
  type?: string;
  steps?: ChallengeStep[] | null;
}): string[] {
  if (challenge.type === 'steps' && challenge.steps?.length) {
    return Array.from(new Set(challenge.steps.map((step) => step.event)));
  }
  return [challenge.trigger];
}

/**
 * Whether an event moves a challenge forward from `progress`. A counter takes any matching event.
 * Steps are ordered, so only the next step's event counts, and an event for a later step is
 * ignored until the earlier ones are done. `passes` decides whether a payload meets some filters.
 */
export function eventAdvances(
  challenge: {
    trigger: string;
    type?: string;
    filters?: ChallengeFilter[] | null;
    steps?: ChallengeStep[] | null;
  },
  progress: number,
  eventType: string,
  passes: (filters: ChallengeFilter[]) => boolean
): boolean {
  if (challenge.filters?.length && !passes(challenge.filters)) return false;

  if (challenge.type === 'steps') {
    const step = challenge.steps?.[progress];
    if (!step || step.event !== eventType) return false;
    return !step.filters?.length || passes(step.filters);
  }
  return challenge.trigger === eventType;
}
