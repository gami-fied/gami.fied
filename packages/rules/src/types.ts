export type Operator =
  | 'equals'
  | 'not_equals'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in';

export interface SimpleCondition {
  field: string;
  operator: Operator;
  value?: unknown;
}

export type AggregateMetric = 'sum' | 'count' | 'unique';

/**
 * The stretch of time an aggregate looks at, ending at the event being evaluated.
 * Calendar windows are in UTC. `last_*` windows roll back from the event.
 */
export type AggregateWindow =
  | 'all_time'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'calendar_day'
  | 'calendar_week'
  | 'calendar_month';

export interface AggregateSpec {
  metric: AggregateMetric;
  /** Event type to look at. Defaults to the rule's trigger. */
  event?: string;
  /** Payload field such as `payload.amount`. Needed for `sum` and `unique`. */
  field?: string;
  window: AggregateWindow;
}

export type AggregateOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal';

/**
 * Compares a total over this user's past events with a number, for example "spent $100 this
 * month". By default it matches only on the event that makes the comparison become true, so a
 * threshold rule fires once per window instead of on every later event. Set `crossing` to false
 * to match on every event while it holds.
 */
export interface AggregateCondition {
  aggregate: AggregateSpec;
  operator: AggregateOperator;
  value: number;
  crossing?: boolean;
}

/** What an aggregate came to with this event counted, and without it. */
export interface AggregateValue {
  value: number;
  previous: number;
}

export type AggregateValues = Record<string, AggregateValue>;

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
}

export type Condition = SimpleCondition | AggregateCondition | ConditionGroup;

export interface ActionDefinition {
  type: string;
  params?: Record<string, unknown>;
}

export interface RuleDefinition {
  trigger: string;
  conditions?: Condition;
  actions: ActionDefinition[];
}

export interface EvaluationResult {
  matched: boolean;
  ruleId?: string;
  triggerMatched: boolean;
  conditionsMatched: boolean;
  actions: ActionDefinition[];
  error?: string;
}

export interface EventData {
  id: string;
  projectId: string;
  userId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date | string;
}

export const SAFETY_LIMITS = {
  MAX_CONDITION_COUNT: 20,
  MAX_NESTING_DEPTH: 5,
  MAX_ACTION_COUNT: 10,
  MAX_RULE_JSON_BYTES: 16384, // 16KB
} as const;
