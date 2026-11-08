import { localDayIndex } from './streaks.js';

/** Pure rules for XP boosts and limits, so they can be tested without a database. */

export interface BoostSettings {
  id: string;
  name: string;
  multiplier: number;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  /** 0 (Monday) to 6 (Sunday), or null for every day. */
  daysOfWeek: number[] | null;
  /** Hours `[fromHour, toHour)` in `timeZone`, or null for all day. A range that wraps midnight, such as 22 to 4, works. */
  fromHour: number | null;
  toHour: number | null;
  timeZone: string;
  eventTypes: string[] | null;
}

function localParts(at: Date, timeZone: string): { weekday: number; hour: number } {
  let hour = at.getUTCHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(at);
    hour = Number(parts.find((part) => part.type === 'hour')?.value ?? hour);
  } catch {
    // An unknown zone falls back to UTC.
  }
  // 1970-01-01 was a Thursday, so adding 3 makes Monday 0.
  return { weekday: (localDayIndex(at, timeZone) + 3) % 7, hour };
}

export function boostApplies(boost: BoostSettings, at: Date, eventType: string): boolean {
  if (!boost.enabled) return false;
  if (boost.startAt && at < boost.startAt) return false;
  if (boost.endAt && at >= boost.endAt) return false;
  if (boost.eventTypes && boost.eventTypes.length > 0 && !boost.eventTypes.includes(eventType)) return false;

  const { weekday, hour } = localParts(at, boost.timeZone);
  if (boost.daysOfWeek && boost.daysOfWeek.length > 0 && !boost.daysOfWeek.includes(weekday)) return false;

  if (boost.fromHour !== null && boost.toHour !== null && boost.fromHour !== boost.toHour) {
    const inside =
      boost.fromHour < boost.toHour ? hour >= boost.fromHour && hour < boost.toHour : hour >= boost.fromHour || hour < boost.toHour;
    if (!inside) return false;
  }
  return true;
}

/** When boosts overlap, the strongest one applies, so promotions never stack into something unplanned. */
export function strongestBoost(boosts: BoostSettings[], at: Date, eventType: string): BoostSettings | null {
  let best: BoostSettings | null = null;
  for (const boost of boosts) {
    if (boostApplies(boost, at, eventType) && (!best || boost.multiplier > best.multiplier)) best = boost;
  }
  return best;
}

export function boostedAmount(amount: number, multiplier: number): number {
  return Math.max(1, Math.round(amount * multiplier));
}

export type LimitPeriod = 'day' | 'week' | 'month';

/** The start of the current UTC day, Monday-to-Sunday week or month. */
export function limitPeriodStart(period: LimitPeriod, at: Date): Date {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  if (period === 'day') return new Date(day);
  if (period === 'week') return new Date(day - ((at.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export interface LimitSettings {
  id: string;
  name: string;
  kind: 'xp_cap' | 'award_cap' | 'cooldown';
  period: LimitPeriod | null;
  amount: number;
}

export interface LimitUsage {
  /** XP rules gave in the period. */
  xp: number;
  /** How many awards rules made in the period. */
  awards: number;
  /** When the last matching award was made. */
  lastAwardAt: Date | null;
}

export interface LimitOutcome {
  /** What may be given after every limit has had its say. */
  allowed: number;
  /** The limits that held something back. */
  hits: { limit: LimitSettings; allowed: number }[];
}

/**
 * Applies limits in turn. A cap lets through whatever room is left, so someone one XP under the
 * cap still gets it, and a cooldown or a full cap lets nothing through.
 */
export function applyLimits(
  wanted: number,
  limits: { limit: LimitSettings; usage: LimitUsage }[],
  now: Date
): LimitOutcome {
  let allowed = wanted;
  const hits: LimitOutcome['hits'] = [];

  for (const { limit, usage } of limits) {
    let room = allowed;
    if (limit.kind === 'xp_cap') room = Math.max(0, limit.amount - usage.xp);
    else if (limit.kind === 'award_cap') room = usage.awards < limit.amount ? allowed : 0;
    else if (usage.lastAwardAt && now.getTime() - usage.lastAwardAt.getTime() < limit.amount * 1000) room = 0;

    if (room < allowed) {
      allowed = room;
      hits.push({ limit, allowed });
    }
  }
  return { allowed, hits };
}
