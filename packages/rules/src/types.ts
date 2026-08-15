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

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
}

export type Condition = SimpleCondition | ConditionGroup;

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
