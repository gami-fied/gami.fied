import type {
  AggregateCondition,
  AggregateSpec,
  AggregateValues,
  AggregateWindow,
  Condition,
  ConditionGroup,
  EventData,
} from './types.js';

export const AGGREGATE_METRICS = ['sum', 'count', 'unique'] as const;
export const AGGREGATE_WINDOWS: AggregateWindow[] = [
  'all_time',
  'last_24h',
  'last_7d',
  'last_30d',
  'last_90d',
  'calendar_day',
  'calendar_week',
  'calendar_month',
];
export const AGGREGATE_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
] as const;

/** Payload paths only: letters, digits, underscores and dashes, so they are safe to query on. */
export const AGGREGATE_FIELD_PATTERN = /^payload(\.[A-Za-z0-9_-]+)+$/;

export function isAggregateCondition(cond: Condition): cond is AggregateCondition {
  return typeof (cond as AggregateCondition).aggregate === 'object' && (cond as AggregateCondition).aggregate !== null;
}

/** A stable key for one aggregate, shared by the worker that computes it and the evaluator that reads it. */
export function aggregateKey(spec: AggregateSpec, defaultEvent: string): string {
  return [spec.metric, spec.event ?? defaultEvent, spec.field ?? '', spec.window].join('|');
}

/** Every aggregate a condition tree needs, so they can be computed before it is evaluated. */
export function collectAggregateSpecs(cond: Condition | undefined, defaultEvent: string): Map<string, AggregateSpec> {
  const found = new Map<string, AggregateSpec>();

  const visit = (node: Condition) => {
    if (isAggregateCondition(node)) {
      found.set(aggregateKey(node.aggregate, defaultEvent), node.aggregate);
      return;
    }
    const group = node as ConditionGroup;
    group.all?.forEach(visit);
    group.any?.forEach(visit);
    if (group.not) visit(group.not);
  };

  if (cond) visit(cond);
  return found;
}

/** The start of a window ending at `at`, or null when it has no start. */
export function aggregateWindowStart(window: AggregateWindow, at: Date): Date | null {
  const hour = 3_600_000;
  switch (window) {
    case 'all_time':
      return null;
    case 'last_24h':
      return new Date(at.getTime() - 24 * hour);
    case 'last_7d':
      return new Date(at.getTime() - 7 * 24 * hour);
    case 'last_30d':
      return new Date(at.getTime() - 30 * 24 * hour);
    case 'last_90d':
      return new Date(at.getTime() - 90 * 24 * hour);
    case 'calendar_day':
      return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    case 'calendar_week': {
      const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
      const sinceMonday = (day.getUTCDay() + 6) % 7;
      return new Date(day.getTime() - sinceMonday * 24 * hour);
    }
    case 'calendar_month':
      return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  }
}

export function compareAggregate(operator: AggregateCondition['operator'], actual: number, target: number): boolean {
  switch (operator) {
    case 'equals':
      return actual === target;
    case 'not_equals':
      return actual !== target;
    case 'greater_than':
      return actual > target;
    case 'greater_than_or_equal':
      return actual >= target;
    case 'less_than':
      return actual < target;
    case 'less_than_or_equal':
      return actual <= target;
  }
}

/** One question for the database: the total of a metric for one user, inside a window. */
export interface AggregateQuery {
  spec: AggregateSpec;
  /** The event type to look at. */
  event: string;
  /** Window start, or null for no start. */
  start: Date | null;
  /** Window end: the time of the event being evaluated. */
  at: Date;
  /** Leave this event out, to measure how things stood before it. */
  excludeEventId: string | null;
}

export type AggregateMeasure = (query: AggregateQuery) => Promise<number>;

/**
 * Works out every aggregate a condition tree asks for, with the event counted and without it.
 * The caller supplies `measure`, so this stays free of any database. Each window ends at the
 * event's own time, so evaluating the same event again gives the same answer.
 */
export async function resolveAggregates(
  conditions: unknown,
  event: EventData,
  measure: AggregateMeasure
): Promise<AggregateValues | undefined> {
  if (!event.userId || !conditions) return undefined;

  let specs: Map<string, AggregateSpec>;
  try {
    specs = collectAggregateSpecs(conditions as Condition, event.type);
  } catch {
    // A malformed tree is reported by validation when the rule is evaluated.
    return undefined;
  }
  if (specs.size === 0) return undefined;

  const at = new Date(event.occurredAt);
  const values: AggregateValues = {};
  for (const [key, spec] of specs) {
    const query = { spec, event: spec.event ?? event.type, start: aggregateWindowStart(spec.window, at), at };
    const [value, previous] = await Promise.all([
      measure({ ...query, excludeEventId: null }),
      measure({ ...query, excludeEventId: event.id }),
    ]);
    values[key] = { value, previous };
  }
  return values;
}
