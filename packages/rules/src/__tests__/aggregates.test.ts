import { describe, expect, it } from 'vitest';
import {
  aggregateKey,
  aggregateWindowStart,
  collectAggregateSpecs,
  evaluateRule,
  resolveAggregates,
  validateRuleDefinition,
  type AggregateValues,
  type EventData,
  type RuleDefinition,
} from '../index.js';

const event: EventData = {
  id: 'evt_1',
  projectId: 'prj_1',
  userId: 'usr_1',
  type: 'purchase',
  payload: { amount: 40 },
  occurredAt: '2026-03-18T12:00:00Z',
};

const spend100: RuleDefinition = {
  trigger: 'purchase',
  conditions: {
    aggregate: { metric: 'sum', field: 'payload.amount', window: 'calendar_month' },
    operator: 'greater_than_or_equal',
    value: 100,
  },
  actions: [{ type: 'award_xp', params: { amount: 50 } }],
};

const key = aggregateKey({ metric: 'sum', field: 'payload.amount', window: 'calendar_month' }, 'purchase');
const at = (value: number, previous: number): AggregateValues => ({ [key]: { value, previous } });

describe('aggregate conditions', () => {
  it('fires on the event that crosses the threshold', () => {
    expect(evaluateRule(spend100, event, 'r', at(110, 70)).matched).toBe(true);
  });

  it('does not fire before the threshold, or again after it', () => {
    expect(evaluateRule(spend100, event, 'r', at(90, 50)).matched).toBe(false);
    expect(evaluateRule(spend100, event, 'r', at(150, 110)).matched).toBe(false);
  });

  it('can match on every event while it holds when crossing is turned off', () => {
    const everyTime = {
      ...spend100,
      conditions: { ...(spend100.conditions as object), crossing: false },
    };
    expect(evaluateRule(everyTime, event, 'r', at(150, 110)).matched).toBe(true);
  });

  it('never matches without a computed value', () => {
    expect(evaluateRule(spend100, event, 'r').matched).toBe(false);
  });

  it('combines with ordinary conditions', () => {
    const rule: RuleDefinition = {
      ...spend100,
      conditions: {
        all: [spend100.conditions!, { field: 'payload.amount', operator: 'greater_than', value: 30 }],
      },
    };
    expect(evaluateRule(rule, event, 'r', at(110, 70)).matched).toBe(true);
    expect(evaluateRule(rule, { ...event, payload: { amount: 10 } }, 'r', at(110, 70)).matched).toBe(false);
  });

  it('works for a count that reaches a number', () => {
    const count = aggregateKey({ metric: 'count', window: 'last_7d' }, 'purchase');
    const rule: RuleDefinition = {
      trigger: 'purchase',
      conditions: { aggregate: { metric: 'count', window: 'last_7d' }, operator: 'equals', value: 5 },
      actions: [{ type: 'award_xp', params: { amount: 5 } }],
    };
    expect(evaluateRule(rule, event, 'r', { [count]: { value: 5, previous: 4 } }).matched).toBe(true);
    expect(evaluateRule(rule, event, 'r', { [count]: { value: 6, previous: 5 } }).matched).toBe(false);
  });
});

describe('validation', () => {
  const withCondition = (condition: unknown) =>
    validateRuleDefinition({ trigger: 'purchase', actions: [{ type: 'award_xp' }], conditions: condition });

  it('accepts a valid aggregate', () => {
    expect(() => withCondition(spend100.conditions)).not.toThrow();
  });

  it.each([
    ['an unknown metric', { aggregate: { metric: 'avg', window: 'all_time' }, operator: 'equals', value: 1 }],
    ['an unknown window', { aggregate: { metric: 'count', window: 'yearly' }, operator: 'equals', value: 1 }],
    ['sum without a field', { aggregate: { metric: 'sum', window: 'all_time' }, operator: 'equals', value: 1 }],
    ['a field outside the payload', { aggregate: { metric: 'sum', field: 'userId', window: 'all_time' }, operator: 'equals', value: 1 }],
    ['a field that tries to break out', { aggregate: { metric: 'sum', field: "payload.a'; DROP TABLE events;--", window: 'all_time' }, operator: 'equals', value: 1 }],
    ['a text target', { aggregate: { metric: 'count', window: 'all_time' }, operator: 'equals', value: 'ten' }],
    ['an operator that does not fit', { aggregate: { metric: 'count', window: 'all_time' }, operator: 'contains', value: 1 }],
  ])('rejects %s', (_label, condition) => {
    expect(() => withCondition(condition)).toThrow();
  });
});

describe('helpers', () => {
  it('collects each distinct aggregate once, from anywhere in the tree', () => {
    const specs = collectAggregateSpecs(
      {
        any: [
          spend100.conditions!,
          { not: spend100.conditions! },
          { aggregate: { metric: 'count', window: 'last_24h' }, operator: 'greater_than', value: 3 },
        ],
      },
      'purchase'
    );
    expect(specs.size).toBe(2);
  });

  it('finds the start of each window', () => {
    const wednesday = new Date('2026-03-18T12:34:56Z');
    expect(aggregateWindowStart('all_time', wednesday)).toBeNull();
    expect(aggregateWindowStart('last_24h', wednesday)?.toISOString()).toBe('2026-03-17T12:34:56.000Z');
    expect(aggregateWindowStart('calendar_day', wednesday)?.toISOString()).toBe('2026-03-18T00:00:00.000Z');
    expect(aggregateWindowStart('calendar_week', wednesday)?.toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(aggregateWindowStart('calendar_month', wednesday)?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(aggregateWindowStart('calendar_week', new Date('2026-03-15T08:00:00Z'))?.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  it('measures with and without the current event, and defaults to the trigger', async () => {
    const calls: { event: string; exclude: string | null }[] = [];
    const values = await resolveAggregates(spend100.conditions, event, async (query) => {
      calls.push({ event: query.event, exclude: query.excludeEventId });
      return query.excludeEventId ? 70 : 110;
    });

    expect(values?.[key]).toEqual({ value: 110, previous: 70 });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.event === 'purchase')).toBe(true);
    expect(calls.map((call) => call.exclude).sort()).toEqual(['evt_1', null]);
  });

  it('measures nothing for an event with no user or a rule with no aggregates', async () => {
    const never = async () => {
      throw new Error('should not be called');
    };
    expect(await resolveAggregates(spend100.conditions, { ...event, userId: null }, never)).toBeUndefined();
    expect(await resolveAggregates({ field: 'payload.x', operator: 'exists' }, event, never)).toBeUndefined();
  });
});
