import type { Operator, VisualCondition } from './visual-condition-builder';

export type AggregateMetric = 'sum' | 'count' | 'unique';
export type AggregateWindow =
  | 'all_time'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'calendar_day'
  | 'calendar_week'
  | 'calendar_month';

export interface AggregateCondition {
  aggregate: { metric: AggregateMetric; event?: string; field?: string; window: AggregateWindow };
  operator: Operator;
  value: number;
  crossing?: boolean;
}


/** A "total over past events" row, as the rules engine stores it. */
export function buildTotalCondition(c: VisualCondition): AggregateCondition {
  const metric = c.metric ?? 'sum';
  const aggregate: AggregateCondition['aggregate'] = { metric, window: c.window ?? 'calendar_month' };
  if (metric !== 'count') aggregate.field = c.field.trim();
  if (c.totalEvent?.trim()) aggregate.event = c.totalEvent.trim();
  const condition: AggregateCondition = { aggregate, operator: c.operator, value: Number(c.value) };
  if (c.crossing === false) condition.crossing = false;
  return condition;
}

/** Reads a stored aggregate back into a row. */
export function parseTotalCondition(c: AggregateCondition): VisualCondition {
  return {
    id: `cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    kind: 'total',
    metric: c.aggregate.metric,
    field: c.aggregate.field ?? 'payload.amount',
    totalEvent: c.aggregate.event ?? '',
    window: c.aggregate.window,
    operator: c.operator,
    value: String(c.value),
    crossing: c.crossing !== false,
  };
}

