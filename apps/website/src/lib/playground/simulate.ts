/**
 * Runs a playground setup over a list of events, in the browser, with the same rules engine and
 * progression maths the worker uses. Nothing is stored and nothing is sent anywhere.
 *
 * It follows the worker's order for each event: enabled rules for the event type run first, oldest
 * first, then the event counts toward streaks. A streak that changes emits a `streak_updated`
 * event, which runs through the rules in turn, as it does on a real install.
 *
 * Left out, and said so on the page: boosts, limits, challenges, leaderboards and achievements that
 * measure their own progress.
 */
import {
  aggregateKey,
  collectAggregateSpecs,
  evaluateRule,
  resolveAggregates,
  validateRuleForSave,
  type AggregateQuery,
  type EventData,
  type RuleDefinition,
} from '@gami/rules';
import {
  applyActivity,
  calculateLevel,
  EMPTY_STREAK,
  getLevelsCrossed,
  type LevelDefinitionInput,
  type StreakCadence,
  type StreakChange,
  type StreakState,
} from '@gami/progression';

export const STREAK_EVENT_TYPE = 'streak_updated';
const PROJECT_ID = 'playground';
const USER_ID = 'player_1';

export interface PlaygroundRule {
  id: string;
  name: string;
  enabled: boolean;
  definition: RuleDefinition;
}

export interface PlaygroundAchievement {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export interface PlaygroundCurrency {
  key: string;
  name: string;
  symbol: string | null;
}

export interface PlaygroundStreak {
  key: string;
  name: string;
  /** The event type that counts as activity. */
  triggerEvent: string;
  cadence: StreakCadence;
  freezeEvery: number;
  maxFreezes: number;
}

export interface PlaygroundSetup {
  rules: PlaygroundRule[];
  achievements: PlaygroundAchievement[];
  currencies: PlaygroundCurrency[];
  levels: LevelDefinitionInput[];
  streaks: PlaygroundStreak[];
  /** IANA time zone for streak days. */
  timeZone: string;
}

export interface PlaygroundEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** ISO time. */
  occurredAt: string;
}

export type Effect =
  | { kind: 'xp'; amount: number; ruleId: string }
  | { kind: 'level'; level: number; name: string }
  | { kind: 'badge'; key: string; name: string; ruleId: string }
  | { kind: 'badge_repeat'; key: string; name: string; ruleId: string }
  | { kind: 'currency'; currency: string; amount: number; ruleId: string }
  | { kind: 'streak'; key: string; name: string; change: StreakChange; current: number; freezesUsed: number; freezesEarned: number }
  | { kind: 'plugin'; type: string; ruleId: string };

export interface RuleOutcome {
  ruleId: string;
  name: string;
  matched: boolean;
  triggerMatched: boolean;
  conditionsMatched: boolean;
  /** Why the rule could not run, such as an invalid definition. */
  error?: string;
  /** Totals the rule's conditions looked at, as "name: before → after". */
  aggregates: { label: string; previous: number; value: number }[];
}

export interface Totals {
  xp: number;
  level: number;
  levelName: string;
  /** Progress to the next level, 0 to 100. */
  progressPercent: number;
  xpToNextLevel: number;
  badges: string[];
  wallets: Record<string, number>;
  streaks: Record<string, StreakState>;
}

export interface Step {
  event: PlaygroundEvent;
  /** True for `streak_updated` events the engine made itself. */
  emitted: boolean;
  rules: RuleOutcome[];
  effects: Effect[];
  /** Everything after this event. */
  totals: Totals;
}

export interface Simulation {
  steps: Step[];
  totals: Totals;
}

/** Most events one run will process, emitted ones included, so a bad setup cannot hang the page. */
export const MAX_EVENTS = 500;

/** Checks a rule the way saving it on a real install would. Returns the problem, or null. */
export function ruleProblem(definition: unknown): string | null {
  try {
    validateRuleForSave(definition);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** The number a payload field holds, matching the database's rule: only plain numbers count. */
function numericField(payload: Record<string, unknown>, field: string): number | null {
  let value: unknown = { payload };
  for (const part of field.split('.')) {
    if (value === null || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[part];
  }
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null;
  return text !== null && /^-?[0-9]+(\.[0-9]+)?$/.test(text) ? Number(text) : null;
}

function fieldText(payload: Record<string, unknown>, field: string): string | null {
  let value: unknown = { payload };
  for (const part of field.split('.')) {
    if (value === null || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[part];
  }
  if (value === undefined || value === null) return null;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** The in-memory version of the database's aggregate query, over this player's past events. */
function measure(history: PlaygroundEvent[], query: AggregateQuery): number {
  const end = query.at.getTime();
  const start = query.start?.getTime() ?? -Infinity;
  const events = history.filter((event) => {
    const at = new Date(event.occurredAt).getTime();
    return event.type === query.event && at <= end && at >= start && event.id !== query.excludeEventId;
  });
  const { metric, field } = query.spec;
  if (metric === 'count') return events.length;
  if (!field) return 0;
  if (metric === 'unique') return new Set(events.map((event) => fieldText(event.payload, field)).filter((v) => v !== null)).size;
  return events.reduce((sum, event) => sum + (numericField(event.payload, field) ?? 0), 0);
}

const METRIC_LABEL = { count: 'Count', sum: 'Total', unique: 'Different' } as const;

function totalsFrom(state: { xp: number; badges: Set<string>; wallets: Map<string, number>; streaks: Map<string, StreakState> }, levels: LevelDefinitionInput[]): Totals {
  let level = { level: 1, name: 'Level 1', progressPercent: 0, xpToNextLevel: 0 };
  try {
    level = calculateLevel(state.xp, levels);
  } catch {
    // No enabled levels: the page asks for at least one.
  }
  return {
    xp: state.xp,
    level: level.level,
    levelName: level.name,
    progressPercent: level.progressPercent,
    xpToNextLevel: level.xpToNextLevel,
    badges: [...state.badges],
    wallets: Object.fromEntries(state.wallets),
    streaks: Object.fromEntries(state.streaks),
  };
}

/** Runs every event through the setup, in time order. */
export async function simulate(setup: PlaygroundSetup, events: PlaygroundEvent[]): Promise<Simulation> {
  const state = {
    xp: 0,
    badges: new Set<string>(),
    wallets: new Map<string, number>(),
    streaks: new Map<string, StreakState>(),
  };
  const history: PlaygroundEvent[] = [];
  const steps: Step[] = [];
  const queue = [...events]
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .map((event) => ({ event, emitted: false }));
  let emittedCount = 0;

  while (queue.length && steps.length < MAX_EVENTS) {
    const { event, emitted } = queue.shift()!;
    history.push(event);
    const data: EventData = { id: event.id, projectId: PROJECT_ID, userId: USER_ID, type: event.type, payload: event.payload, occurredAt: event.occurredAt };
    const outcomes: RuleOutcome[] = [];
    const effects: Effect[] = [];

    // Rules for this event type, in the order they were added.
    for (const rule of setup.rules) {
      if (!rule.enabled || rule.definition.trigger !== event.type) continue;
      const problem = ruleProblem(rule.definition);
      if (problem) {
        outcomes.push({ ruleId: rule.id, name: rule.name, matched: false, triggerMatched: true, conditionsMatched: false, error: problem, aggregates: [] });
        continue;
      }
      const aggregates = await resolveAggregates(rule.definition.conditions, data, async (query) => measure(history, query));
      const result = evaluateRule(rule.definition, data, rule.id, aggregates);
      const specs = collectAggregateSpecs(rule.definition.conditions, rule.definition.trigger);
      outcomes.push({
        ruleId: rule.id,
        name: rule.name,
        matched: result.matched,
        triggerMatched: result.triggerMatched,
        conditionsMatched: result.conditionsMatched,
        error: result.error,
        aggregates: [...specs.entries()].map(([key, spec]) => ({
          label: `${METRIC_LABEL[spec.metric]} of ${spec.field ? `${spec.field.replace(/^payload\./, '')} in ` : ''}${spec.event ?? rule.definition.trigger} (${spec.window.replace(/_/g, ' ')})`,
          previous: aggregates?.[key]?.previous ?? 0,
          value: aggregates?.[key]?.value ?? 0,
        })),
      });
      if (!result.matched) continue;

      for (const action of result.actions) {
        const params = action.params ?? {};
        if (action.type === 'award_xp') {
          const amount = Number(params['amount']) || 0;
          const before = state.xp;
          state.xp += amount;
          effects.push({ kind: 'xp', amount, ruleId: rule.id });
          for (const level of getLevelsCrossed(before, state.xp, setup.levels)) {
            const definition = setup.levels.find((item) => item.level === level);
            effects.push({ kind: 'level', level, name: definition?.name ?? `Level ${level}` });
          }
        } else if (action.type === 'award_achievement') {
          const key = String(params['achievementKey'] ?? '');
          const name = setup.achievements.find((item) => item.key === key)?.name ?? key;
          // An achievement is earned once. A second award is skipped, as on a real install.
          if (state.badges.has(key)) effects.push({ kind: 'badge_repeat', key, name, ruleId: rule.id });
          else {
            state.badges.add(key);
            effects.push({ kind: 'badge', key, name, ruleId: rule.id });
          }
        } else if (action.type === 'award_currency') {
          const currency = String(params['currency'] ?? '');
          const amount = Number(params['amount']) || 0;
          state.wallets.set(currency, (state.wallets.get(currency) ?? 0) + amount);
          effects.push({ kind: 'currency', currency, amount, ruleId: rule.id });
        } else {
          effects.push({ kind: 'plugin', type: action.type, ruleId: rule.id });
        }
      }
    }

    // Then streaks. The event a streak emits never feeds a streak, or the two would loop.
    if (event.type !== STREAK_EVENT_TYPE) {
      for (const streak of setup.streaks) {
        if (streak.triggerEvent !== event.type) continue;
        const before = state.streaks.get(streak.key) ?? EMPTY_STREAK;
        const settings = { cadence: streak.cadence, timeZone: setup.timeZone, freezeEvery: streak.freezeEvery, maxFreezes: streak.maxFreezes };
        const update = applyActivity(before, new Date(event.occurredAt), settings);
        if (update.change === 'same_period' || update.change === 'ignored') continue;
        state.streaks.set(streak.key, update.state);
        effects.push({ kind: 'streak', key: streak.key, name: streak.name, change: update.change, current: update.state.current, freezesUsed: update.freezesUsed, freezesEarned: update.freezesEarned });
        emittedCount++;
        // Runs straight after this event, at the same time, like the worker's follow-up job.
        queue.unshift({
          emitted: true,
          event: {
            id: `${event.id}_streak_${streak.key}_${emittedCount}`,
            type: STREAK_EVENT_TYPE,
            occurredAt: event.occurredAt,
            // The same fields the worker sends, so rules written here work on a real install.
            payload: {
              streak: streak.key,
              cadence: streak.cadence,
              change: update.change,
              current: update.state.current,
              longest: update.state.longest,
              freezes: update.state.freezes,
              freezesUsed: update.freezesUsed,
              freezesEarned: update.freezesEarned,
              brokenStreak: update.brokenStreak,
              sourceEventId: event.id,
            },
          },
        });
      }
    }

    steps.push({ event, emitted, rules: outcomes, effects, totals: totalsFrom(state, setup.levels) });
  }

  return { steps, totals: totalsFrom(state, setup.levels) };
}

/** The key a rule's aggregate is stored under, re-exported for the editor. */
export { aggregateKey };
