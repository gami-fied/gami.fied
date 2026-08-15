import { Condition, ConditionGroup, EventData, SimpleCondition } from './types.js';

export function resolveFieldPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path || typeof path !== 'string') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function isSimpleCondition(cond: Condition): cond is SimpleCondition {
  return typeof (cond as SimpleCondition).field === 'string';
}

function evaluateSimpleCondition(cond: SimpleCondition, eventData: EventData): boolean {
  const actualValue = resolveFieldPath(eventData as unknown as Record<string, unknown>, cond.field);
  const targetValue = cond.value;

  switch (cond.operator) {
    case 'equals':
      return actualValue === targetValue;

    case 'not_equals':
      return actualValue !== targetValue;

    case 'exists':
      return actualValue !== undefined && actualValue !== null;

    case 'not_exists':
      return actualValue === undefined || actualValue === null;

    case 'greater_than':
      if (typeof actualValue === 'number' && typeof targetValue === 'number') {
        return actualValue > targetValue;
      }
      return false;

    case 'greater_than_or_equal':
      if (typeof actualValue === 'number' && typeof targetValue === 'number') {
        return actualValue >= targetValue;
      }
      return false;

    case 'less_than':
      if (typeof actualValue === 'number' && typeof targetValue === 'number') {
        return actualValue < targetValue;
      }
      return false;

    case 'less_than_or_equal':
      if (typeof actualValue === 'number' && typeof targetValue === 'number') {
        return actualValue <= targetValue;
      }
      return false;

    case 'contains':
      if (typeof actualValue === 'string' && typeof targetValue === 'string') {
        return actualValue.includes(targetValue);
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(targetValue);
      }
      return false;

    case 'starts_with':
      if (typeof actualValue === 'string' && typeof targetValue === 'string') {
        return actualValue.startsWith(targetValue);
      }
      return false;

    case 'ends_with':
      if (typeof actualValue === 'string' && typeof targetValue === 'string') {
        return actualValue.endsWith(targetValue);
      }
      return false;

    case 'in':
      if (Array.isArray(targetValue)) {
        return targetValue.includes(actualValue);
      }
      return false;

    case 'not_in':
      if (Array.isArray(targetValue)) {
        return !targetValue.includes(actualValue);
      }
      return false;

    default:
      return false;
  }
}

export function evaluateConditionTree(cond: Condition, eventData: EventData): boolean {
  if (isSimpleCondition(cond)) {
    return evaluateSimpleCondition(cond, eventData);
  }

  const group = cond as ConditionGroup;

  if (group.all) {
    for (const child of group.all) {
      if (!evaluateConditionTree(child, eventData)) {
        return false;
      }
    }
  }

  if (group.any) {
    let anyMatched = false;
    for (const child of group.any) {
      if (evaluateConditionTree(child, eventData)) {
        anyMatched = true;
        break;
      }
    }
    if (!anyMatched) return false;
  }

  if (group.not) {
    if (evaluateConditionTree(group.not, eventData)) {
      return false;
    }
  }

  return true;
}
