import { evaluateConditionTree } from './evaluator.js';
import { AggregateValues, EvaluationResult, EventData, RuleDefinition } from './types.js';
import { validateRuleDefinition } from './validator.js';

export function evaluateRule(
  rawRule: unknown,
  event: EventData,
  ruleId?: string,
  aggregates?: AggregateValues
): EvaluationResult {
  try {
    const rule: RuleDefinition = validateRuleDefinition(rawRule);

    // Step 1: Trigger Matching (rule.trigger === event.type)
    const triggerMatched = rule.trigger === event.type;
    if (!triggerMatched) {
      return {
        matched: false,
        ruleId,
        triggerMatched: false,
        conditionsMatched: false,
        actions: [],
      };
    }

    // Step 2: Condition Evaluation
    let conditionsMatched = true;
    if (rule.conditions) {
      conditionsMatched = evaluateConditionTree(rule.conditions, event, aggregates);
    }

    const matched = triggerMatched && conditionsMatched;

    return {
      matched,
      ruleId,
      triggerMatched,
      conditionsMatched,
      actions: matched ? rule.actions : [],
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Rule evaluation failed';
    return {
      matched: false,
      ruleId,
      triggerMatched: false,
      conditionsMatched: false,
      actions: [],
      error: errorMsg,
    };
  }
}
