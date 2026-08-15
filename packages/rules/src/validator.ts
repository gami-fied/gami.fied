import { Condition, Operator, RuleDefinition, SAFETY_LIMITS, SimpleCondition } from './types.js';

const ALLOWED_OPERATORS: Set<Operator> = new Set([
  'equals',
  'not_equals',
  'exists',
  'not_exists',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
]);

function isSimpleCondition(cond: Condition): cond is SimpleCondition {
  return typeof (cond as SimpleCondition).field === 'string';
}

function countAndCheckConditions(
  cond: Condition,
  depth: number
): { count: number; maxDepth: number } {
  if (depth > SAFETY_LIMITS.MAX_NESTING_DEPTH) {
    throw new Error(
      `Condition nesting depth exceeds maximum allowed limit of ${SAFETY_LIMITS.MAX_NESTING_DEPTH}`
    );
  }

  if (isSimpleCondition(cond)) {
    if (!ALLOWED_OPERATORS.has(cond.operator)) {
      throw new Error(`Unsupported operator: ${cond.operator}`);
    }
    if (!cond.field || typeof cond.field !== 'string') {
      throw new Error('Condition field must be a non-empty string');
    }
    return { count: 1, maxDepth: depth };
  }

  let totalCount = 0;
  let currentMaxDepth = depth;

  const group = cond;
  if (group.all) {
    for (const child of group.all) {
      const res = countAndCheckConditions(child, depth + 1);
      totalCount += res.count;
      currentMaxDepth = Math.max(currentMaxDepth, res.maxDepth);
    }
  }
  if (group.any) {
    for (const child of group.any) {
      const res = countAndCheckConditions(child, depth + 1);
      totalCount += res.count;
      currentMaxDepth = Math.max(currentMaxDepth, res.maxDepth);
    }
  }
  if (group.not) {
    const res = countAndCheckConditions(group.not, depth + 1);
    totalCount += res.count;
    currentMaxDepth = Math.max(currentMaxDepth, res.maxDepth);
  }

  return { count: totalCount, maxDepth: currentMaxDepth };
}

export function validateRuleDefinition(rule: unknown): RuleDefinition {
  if (!rule || typeof rule !== 'object') {
    throw new Error('Rule definition must be a valid JSON object');
  }

  const jsonString = JSON.stringify(rule);
  if (Buffer.byteLength(jsonString, 'utf8') > SAFETY_LIMITS.MAX_RULE_JSON_BYTES) {
    throw new Error(
      `Rule JSON size exceeds maximum allowed limit of ${SAFETY_LIMITS.MAX_RULE_JSON_BYTES} bytes`
    );
  }

  const def = rule as RuleDefinition;

  if (!def.trigger || typeof def.trigger !== 'string' || def.trigger.trim() === '') {
    throw new Error('Rule trigger must be a non-empty string');
  }

  if (!Array.isArray(def.actions) || def.actions.length === 0) {
    throw new Error('Rule must contain at least one action');
  }

  if (def.actions.length > SAFETY_LIMITS.MAX_ACTION_COUNT) {
    throw new Error(
      `Rule action count exceeds maximum allowed limit of ${SAFETY_LIMITS.MAX_ACTION_COUNT}`
    );
  }

  for (const action of def.actions) {
    if (!action.type || typeof action.type !== 'string' || action.type.trim() === '') {
      throw new Error('Action type must be a non-empty string');
    }
  }

  if (def.conditions) {
    const { count } = countAndCheckConditions(def.conditions, 1);
    if (count > SAFETY_LIMITS.MAX_CONDITION_COUNT) {
      throw new Error(
        `Condition count (${count}) exceeds maximum allowed limit of ${SAFETY_LIMITS.MAX_CONDITION_COUNT}`
      );
    }
  }

  return def;
}
