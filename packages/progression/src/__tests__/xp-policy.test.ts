import { describe, expect, it } from 'vitest';
import { applyLimits, boostApplies, boostedAmount, limitPeriodStart, strongestBoost, type BoostSettings, type LimitSettings } from '../xp-policy.js';

const boost = (over: Partial<BoostSettings> = {}): BoostSettings => ({
  id: 'b1', name: 'Double', multiplier: 2, enabled: true, startAt: null, endAt: null,
  daysOfWeek: null, fromHour: null, toHour: null, timeZone: 'UTC', eventTypes: null, ...over,
});

describe('boosts', () => {
  it('applies always when nothing restricts it, and never when disabled', () => {
    expect(boostApplies(boost(), new Date('2026-03-18T12:00:00Z'), 'x')).toBe(true);
    expect(boostApplies(boost({ enabled: false }), new Date(), 'x')).toBe(false);
  });

  it('respects the start and end, with the end excluded', () => {
    const b = boost({ startAt: new Date('2026-03-10T00:00:00Z'), endAt: new Date('2026-03-12T00:00:00Z') });
    expect(boostApplies(b, new Date('2026-03-09T23:59:59Z'), 'x')).toBe(false);
    expect(boostApplies(b, new Date('2026-03-10T00:00:00Z'), 'x')).toBe(true);
    expect(boostApplies(b, new Date('2026-03-12T00:00:00Z'), 'x')).toBe(false);
  });

  it('can be a weekend promotion in the player zone', () => {
    const weekend = boost({ daysOfWeek: [5, 6] });
    expect(boostApplies(weekend, new Date('2026-03-14T12:00:00Z'), 'x')).toBe(true); // Saturday
    expect(boostApplies(weekend, new Date('2026-03-16T12:00:00Z'), 'x')).toBe(false); // Monday
    // 23:30 Friday UTC is already Saturday in Tokyo.
    const tokyo = boost({ daysOfWeek: [5], timeZone: 'Asia/Tokyo' });
    expect(boostApplies(tokyo, new Date('2026-03-13T23:30:00Z'), 'x')).toBe(true);
    expect(boostApplies(boost({ daysOfWeek: [5] }), new Date('2026-03-13T23:30:00Z'), 'x')).toBe(false);
  });

  it('handles an hour range, including one that wraps midnight', () => {
    const happyHour = boost({ fromHour: 17, toHour: 19 });
    expect(boostApplies(happyHour, new Date('2026-03-18T17:00:00Z'), 'x')).toBe(true);
    expect(boostApplies(happyHour, new Date('2026-03-18T19:00:00Z'), 'x')).toBe(false);
    const night = boost({ fromHour: 22, toHour: 4 });
    expect(boostApplies(night, new Date('2026-03-18T23:00:00Z'), 'x')).toBe(true);
    expect(boostApplies(night, new Date('2026-03-18T03:00:00Z'), 'x')).toBe(true);
    expect(boostApplies(night, new Date('2026-03-18T12:00:00Z'), 'x')).toBe(false);
  });

  it('can be limited to some events', () => {
    const b = boost({ eventTypes: ['lesson_done'] });
    expect(boostApplies(b, new Date(), 'lesson_done')).toBe(true);
    expect(boostApplies(b, new Date(), 'purchase')).toBe(false);
  });

  it('uses the strongest when several overlap, and rounds sensibly', () => {
    const picked = strongestBoost([boost({ id: 'a', multiplier: 1.5 }), boost({ id: 'b', multiplier: 3 }), boost({ id: 'c', multiplier: 2, enabled: false })], new Date(), 'x');
    expect(picked?.id).toBe('b');
    expect(strongestBoost([], new Date(), 'x')).toBeNull();
    expect(boostedAmount(10, 1.5)).toBe(15);
    expect(boostedAmount(3, 1.5)).toBe(5);
    expect(boostedAmount(1, 0.1)).toBe(1); // never rounds a reward down to nothing
  });
});

describe('limits', () => {
  const cap = (over: Partial<LimitSettings> = {}): LimitSettings => ({ id: 'l1', name: 'Daily cap', kind: 'xp_cap', period: 'day', amount: 100, ...over });
  const none = { xp: 0, awards: 0, lastAwardAt: null };
  const now = new Date('2026-03-18T12:00:00Z');

  it('lets through what fits under an XP cap, and nothing once it is full', () => {
    expect(applyLimits(30, [{ limit: cap(), usage: { ...none, xp: 50 } }], now)).toMatchObject({ allowed: 30, hits: [] });
    expect(applyLimits(30, [{ limit: cap(), usage: { ...none, xp: 90 } }], now)).toMatchObject({ allowed: 10 });
    expect(applyLimits(30, [{ limit: cap(), usage: { ...none, xp: 100 } }], now).allowed).toBe(0);
  });

  it('counts awards', () => {
    const l = cap({ kind: 'award_cap', amount: 3 });
    expect(applyLimits(30, [{ limit: l, usage: { ...none, awards: 2 } }], now).allowed).toBe(30);
    expect(applyLimits(30, [{ limit: l, usage: { ...none, awards: 3 } }], now).allowed).toBe(0);
  });

  it('pauses for a cooldown', () => {
    const l = cap({ kind: 'cooldown', period: null, amount: 60 });
    expect(applyLimits(30, [{ limit: l, usage: { ...none, lastAwardAt: new Date(now.getTime() - 30_000) } }], now).allowed).toBe(0);
    expect(applyLimits(30, [{ limit: l, usage: { ...none, lastAwardAt: new Date(now.getTime() - 61_000) } }], now).allowed).toBe(30);
    expect(applyLimits(30, [{ limit: l, usage: none }], now).allowed).toBe(30);
  });

  it('applies every limit and reports each that held something back', () => {
    const result = applyLimits(50, [
      { limit: cap({ id: 'a', amount: 120 }), usage: { ...none, xp: 100 } },
      { limit: cap({ id: 'b', kind: 'award_cap', amount: 1 }), usage: { ...none, awards: 1 } },
    ], now);
    expect(result.allowed).toBe(0);
    expect(result.hits.map((hit) => hit.limit.id)).toEqual(['a', 'b']);
  });

  it('finds the start of each period in UTC', () => {
    const at = new Date('2026-03-18T12:34:00Z'); // a Wednesday
    expect(limitPeriodStart('day', at).toISOString()).toBe('2026-03-18T00:00:00.000Z');
    expect(limitPeriodStart('week', at).toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(limitPeriodStart('month', at).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
