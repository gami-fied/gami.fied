import { describe, expect, it } from 'vitest';
import {
  applyActivity,
  EMPTY_STREAK,
  isValidTimeZone,
  periodIndex,
  streakStatus,
  type StreakSettings,
  type StreakState,
} from '../streaks.js';

const daily: StreakSettings = { cadence: 'daily', timeZone: 'UTC', freezeEvery: 0, maxFreezes: 0 };
const weekly: StreakSettings = { ...daily, cadence: 'weekly' };
const at = (iso: string) => new Date(iso);

function run(settings: StreakSettings, days: string[], zone?: string): StreakState {
  return days.reduce((state, day) => applyActivity(state, at(day), settings, zone).state, EMPTY_STREAK);
}

describe('periods', () => {
  it('numbers consecutive days consecutively', () => {
    const a = periodIndex(at('2026-03-01T10:00:00Z'), 'UTC', 'daily');
    expect(periodIndex(at('2026-03-02T01:00:00Z'), 'UTC', 'daily')).toBe(a + 1);
    expect(periodIndex(at('2026-03-01T23:59:59Z'), 'UTC', 'daily')).toBe(a);
  });

  it('follows the local calendar, not UTC', () => {
    // 23:30 and 00:30 in Tokyo are 14:30 and 15:30 UTC on the same UTC date.
    const late = periodIndex(at('2026-03-01T14:30:00Z'), 'Asia/Tokyo', 'daily');
    const early = periodIndex(at('2026-03-01T15:30:00Z'), 'Asia/Tokyo', 'daily');
    expect(early).toBe(late + 1);
    expect(periodIndex(at('2026-03-01T14:30:00Z'), 'UTC', 'daily')).toBe(
      periodIndex(at('2026-03-01T15:30:00Z'), 'UTC', 'daily')
    );
  });

  it('starts weeks on Monday', () => {
    const sunday = periodIndex(at('2026-03-01T12:00:00Z'), 'UTC', 'weekly'); // a Sunday
    const monday = periodIndex(at('2026-03-02T12:00:00Z'), 'UTC', 'weekly');
    const nextSunday = periodIndex(at('2026-03-08T12:00:00Z'), 'UTC', 'weekly');
    expect(monday).toBe(sunday + 1);
    expect(nextSunday).toBe(monday);
  });

  it('handles daylight saving without skipping or repeating a day', () => {
    // US clocks went forward on 2026-03-08.
    const days = ['2026-03-07T20:00:00Z', '2026-03-08T20:00:00Z', '2026-03-09T20:00:00Z'];
    const [a, b, c] = days.map((day) => periodIndex(at(day), 'America/New_York', 'daily'));
    expect(b).toBe(a! + 1);
    expect(c).toBe(b! + 1);
  });

  it('falls back to UTC for an unknown time zone', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(periodIndex(at('2026-03-01T10:00:00Z'), 'Mars/Olympus', 'daily')).toBe(
      periodIndex(at('2026-03-01T10:00:00Z'), 'UTC', 'daily')
    );
  });
});

describe('daily streaks', () => {
  it('starts at 1 and grows each day', () => {
    const state = run(daily, ['2026-03-01T08:00:00Z', '2026-03-02T08:00:00Z', '2026-03-03T22:00:00Z']);
    expect(state.current).toBe(3);
    expect(state.longest).toBe(3);
  });

  it('counts several actions in one day once', () => {
    const first = applyActivity(EMPTY_STREAK, at('2026-03-01T08:00:00Z'), daily);
    const second = applyActivity(first.state, at('2026-03-01T20:00:00Z'), daily);
    expect(second.change).toBe('same_period');
    expect(second.state.current).toBe(1);
  });

  it('resets after a missed day but remembers the longest', () => {
    const grown = run(daily, ['2026-03-01T08:00:00Z', '2026-03-02T08:00:00Z', '2026-03-03T08:00:00Z']);
    const update = applyActivity(grown, at('2026-03-05T08:00:00Z'), daily);
    expect(update.change).toBe('reset');
    expect(update.brokenStreak).toBe(3);
    expect(update.state.current).toBe(1);
    expect(update.state.longest).toBe(3);
  });

  it('ignores activity from before the latest counted day', () => {
    const state = run(daily, ['2026-03-05T08:00:00Z']);
    const update = applyActivity(state, at('2026-03-02T08:00:00Z'), daily);
    expect(update.change).toBe('ignored');
    expect(update.state).toEqual(state);
  });

  it('uses the time zone given for the user', () => {
    // Two UTC dates, but one Tokyo-evening and the next Tokyo-morning are consecutive days.
    const state = run(daily, ['2026-03-01T14:30:00Z', '2026-03-01T15:30:00Z'], 'Asia/Tokyo');
    expect(state.current).toBe(2);
  });
});

describe('weekly streaks', () => {
  it('counts one week once however many days it has', () => {
    const state = run(weekly, ['2026-03-02T08:00:00Z', '2026-03-04T08:00:00Z', '2026-03-08T08:00:00Z']);
    expect(state.current).toBe(1);
  });

  it('grows week to week and resets after a skipped week', () => {
    const grown = run(weekly, ['2026-03-02T08:00:00Z', '2026-03-09T08:00:00Z']);
    expect(grown.current).toBe(2);
    expect(applyActivity(grown, at('2026-03-23T08:00:00Z'), weekly).change).toBe('reset');
  });
});

describe('freezes', () => {
  const withFreezes: StreakSettings = { ...daily, freezeEvery: 3, maxFreezes: 2 };

  it('earns a freeze every few days, up to the cap', () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}T08:00:00Z`);
    expect(run(withFreezes, days.slice(0, 3)).freezes).toBe(1);
    expect(run(withFreezes, days.slice(0, 6)).freezes).toBe(2);
    expect(run(withFreezes, days).freezes).toBe(2); // the third would exceed the cap
  });

  it('spends a freeze to cover a missed day', () => {
    const state = run(withFreezes, ['2026-03-01T08:00:00Z', '2026-03-02T08:00:00Z', '2026-03-03T08:00:00Z']);
    expect(state.freezes).toBe(1);

    const update = applyActivity(state, at('2026-03-05T08:00:00Z'), withFreezes); // missed the 4th
    expect(update.change).toBe('frozen');
    expect(update.freezesUsed).toBe(1);
    expect(update.state.current).toBe(4);
    expect(update.state.freezes).toBe(0);
  });

  it('resets when there are not enough freezes for the gap', () => {
    const state = run(withFreezes, ['2026-03-01T08:00:00Z', '2026-03-02T08:00:00Z', '2026-03-03T08:00:00Z']);
    const update = applyActivity(state, at('2026-03-08T08:00:00Z'), withFreezes); // missed four days
    expect(update.change).toBe('reset');
    expect(update.state.current).toBe(1);
    expect(update.state.freezes).toBe(1); // freezes are kept, none were spent
  });

  it('never exceeds the cap even when several are earned', () => {
    const update = applyActivity(
      { current: 5, longest: 5, lastPeriod: periodIndex(at('2026-03-01T00:00:00Z'), 'UTC', 'daily'), freezes: 2 },
      at('2026-03-02T08:00:00Z'),
      withFreezes
    );
    expect(update.state.freezes).toBeLessThanOrEqual(2);
  });
});

describe('status', () => {
  const settings: StreakSettings = { ...daily, freezeEvery: 3, maxFreezes: 2 };
  const state = run(settings, ['2026-03-01T08:00:00Z', '2026-03-02T08:00:00Z', '2026-03-03T08:00:00Z']);

  it('is safe in the period of the last activity', () => {
    expect(streakStatus(state, at('2026-03-03T22:00:00Z'), settings)).toEqual({
      alive: true,
      atRisk: false,
      current: 3,
    });
  });

  it('is alive but at risk the next day', () => {
    expect(streakStatus(state, at('2026-03-04T09:00:00Z'), settings).atRisk).toBe(true);
  });

  it('survives one missed day thanks to a freeze', () => {
    expect(streakStatus(state, at('2026-03-05T09:00:00Z'), settings)).toMatchObject({ alive: true, current: 3 });
  });

  it('reads as ended once the gap passes what freezes cover', () => {
    expect(streakStatus(state, at('2026-03-09T09:00:00Z'), settings)).toEqual({
      alive: false,
      atRisk: false,
      current: 0,
    });
  });

  it('is empty for a user with no activity', () => {
    expect(streakStatus(EMPTY_STREAK, at('2026-03-01T00:00:00Z'), settings).alive).toBe(false);
  });
});
