import { AGGREGATE_FIELD_PATTERN, AGGREGATE_METRICS, AGGREGATE_WINDOWS } from './aggregates.js';
import type { AggregateMetric, AggregateWindow } from './types.js';

/** The event that moves a streak achievement. Streaks emit it themselves. */
export const STREAK_EVENT = 'streak_updated';

export interface EventCriteria {
  /** Event type to look at. */
  event: string;
  metric: AggregateMetric;
  /** Payload field such as `payload.lessons`. Needed for `sum` and `unique`. */
  field?: string;
  window: AggregateWindow;
  /** The number that earns the achievement. */
  target: number;
}

export interface StreakCriteria {
  metric: 'streak';
  /** Key of the streak to follow. */
  streak: string;
  /** The streak length that earns the achievement. */
  target: number;
}

export type AchievementCriteria = EventCriteria | StreakCriteria;

export interface AchievementTier {
  name: string;
  target: number;
  /** XP given when a user reaches this tier. */
  xp?: number;
}

export const MAX_TIERS = 9;

export function isStreakCriteria(criteria: AchievementCriteria): criteria is StreakCriteria {
  return criteria.metric === 'streak';
}

/** The event type whose arrival can change this achievement's progress. */
export function criteriaTrigger(criteria: AchievementCriteria): string {
  return isStreakCriteria(criteria) ? STREAK_EVENT : criteria.event;
}

/** Throws an Error with a plain message when the criteria or tiers cannot work. */
export function validateAchievementCriteria(criteria: unknown, tiers: unknown): {
  criteria: AchievementCriteria;
  tiers: AchievementTier[];
} {
  if (!criteria || typeof criteria !== 'object') throw new Error('Criteria must be an object');
  const raw = criteria as Record<string, unknown>;

  if (typeof raw['target'] !== 'number' || !Number.isFinite(raw['target']) || raw['target'] <= 0) {
    throw new Error('The target must be a number above 0');
  }
  const target = raw['target'];

  let parsed: AchievementCriteria;
  if (raw['metric'] === 'streak') {
    if (typeof raw['streak'] !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw['streak'])) {
      throw new Error('A streak achievement needs the key of the streak to follow');
    }
    if (!Number.isInteger(target)) throw new Error('A streak target must be a whole number');
    parsed = { metric: 'streak', streak: raw['streak'], target };
  } else {
    if (!(AGGREGATE_METRICS as readonly string[]).includes(raw['metric'] as string)) {
      throw new Error('The metric must be count, sum, unique or streak');
    }
    if (typeof raw['event'] !== 'string' || raw['event'].trim() === '' || raw['event'].length > 128) {
      throw new Error('Choose the event type to measure');
    }
    if (!AGGREGATE_WINDOWS.includes(raw['window'] as AggregateWindow)) {
      throw new Error('Choose how far back to look');
    }
    const metric = raw['metric'] as AggregateMetric;
    if (metric !== 'count' && (typeof raw['field'] !== 'string' || !AGGREGATE_FIELD_PATTERN.test(raw['field']))) {
      throw new Error('Sum and unique need a payload field such as "payload.minutes"');
    }
    parsed = {
      event: raw['event'].trim(),
      metric,
      window: raw['window'] as AggregateWindow,
      target,
      ...(metric !== 'count' ? { field: raw['field'] as string } : {}),
    };
  }

  const list = tiers === undefined || tiers === null ? [] : tiers;
  if (!Array.isArray(list)) throw new Error('Tiers must be a list');
  if (list.length > MAX_TIERS) throw new Error(`An achievement can have at most ${MAX_TIERS} extra tiers`);

  let previous = parsed.target;
  const cleaned = list.map((item, index): AchievementTier => {
    const tier = item as Record<string, unknown>;
    if (typeof tier['name'] !== 'string' || tier['name'].trim() === '' || tier['name'].length > 64) {
      throw new Error(`Tier ${index + 2} needs a name`);
    }
    if (typeof tier['target'] !== 'number' || !(tier['target'] > previous)) {
      throw new Error(`Tier ${index + 2} must have a target above ${previous}`);
    }
    if (tier['xp'] !== undefined && (!Number.isInteger(tier['xp']) || (tier['xp'] as number) < 0 || (tier['xp'] as number) > 1_000_000)) {
      throw new Error(`Tier ${index + 2} XP must be a whole number from 0 to 1,000,000`);
    }
    previous = tier['target'];
    return {
      name: tier['name'].trim(),
      target: tier['target'],
      ...(typeof tier['xp'] === 'number' && tier['xp'] > 0 ? { xp: tier['xp'] } : {}),
    };
  });

  return { criteria: parsed, tiers: cleaned };
}

/** All the targets in order: the achievement's own, then each tier's. */
export function tierTargets(criteria: AchievementCriteria, tiers: AchievementTier[]): number[] {
  return [criteria.target, ...tiers.map((tier) => tier.target)];
}

/** The highest tier a value reaches. 0 means not yet, 1 is the achievement's own target. */
export function tierReached(value: number, criteria: AchievementCriteria, tiers: AchievementTier[]): number {
  return tierTargets(criteria, tiers).filter((target) => value >= target).length;
}

export interface ProgressView {
  value: number;
  tier: number;
  /** The target being worked toward, or null once every tier is done. */
  nextTarget: number | null;
  /** 0 to 1 toward `nextTarget`, from the previous target. */
  fraction: number;
  complete: boolean;
}

export function describeProgress(
  value: number,
  tier: number,
  criteria: AchievementCriteria,
  tiers: AchievementTier[]
): ProgressView {
  const targets = tierTargets(criteria, tiers);
  const nextTarget = targets[tier] ?? null;
  if (nextTarget === null) return { value, tier, nextTarget: null, fraction: 1, complete: true };

  const floor = tier > 0 ? (targets[tier - 1] as number) : 0;
  const fraction = Math.max(0, Math.min(1, (value - floor) / (nextTarget - floor)));
  return { value, tier, nextTarget, fraction, complete: false };
}
