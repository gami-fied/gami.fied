export interface StreakDay {
  /** `YYYY-MM-DD` in the player's time zone. */
  date: string;
  active: boolean;
  today: boolean;
}

const DAY_MS = 86_400_000;

function localDate(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Monday is 0. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The days to draw for a daily streak: whole Monday-to-Sunday weeks ending with this one, with
 * the days of the current run marked. The run ends on the player's last active day, so a streak
 * that has not been continued today still shows yesterday's run.
 */
export function runDays(options: {
  current: number;
  lastActivityAt: string | null;
  timeZone: string;
  weeks: number;
  now?: Date;
}): StreakDay[] {
  const now = options.now ?? new Date();
  const today = localDate(now, options.timeZone);
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  const active = new Set<string>();
  if (options.lastActivityAt && options.current > 0) {
    const lastMs = Date.parse(`${localDate(new Date(options.lastActivityAt), options.timeZone)}T00:00:00Z`);
    for (let offset = 0; offset < options.current; offset++) {
      active.add(new Date(lastMs - offset * DAY_MS).toISOString().slice(0, 10));
    }
  }

  const weeks = Math.max(1, Math.min(12, options.weeks));
  const startMs = todayMs - weekdayIndex(today) * DAY_MS - (weeks - 1) * 7 * DAY_MS;
  const endMs = todayMs + (6 - weekdayIndex(today)) * DAY_MS;

  const days: StreakDay[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    days.push({ date, active: active.has(date), today: date === today });
  }
  return days;
}
