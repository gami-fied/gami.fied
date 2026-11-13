// The visual builder's converters, shared with the dashboard from packages/ui. A rule built with
// them must be one the engine accepts and evaluates the way the builder shows it.
import { describe, expect, it } from 'vitest';
import { evaluateRule, validateRuleForSave } from '@gami/rules';
import {
  buildRulesEngineActions,
  buildRulesEngineConditions,
  parseRulesEngineActions,
  parseRulesEngineConditions,
  typedValue,
  type VisualCondition,
} from '@gami/ui/rules';

const row = (patch: Partial<VisualCondition>): VisualCondition => ({ id: 'c', field: 'payload.score', operator: 'equals', value: '', ...patch });
const event = (payload: Record<string, unknown>) => ({ id: 'e', projectId: 'p', userId: 'u', type: 'lesson_completed', payload, occurredAt: '2026-11-12T10:00:00Z' });

describe('rule builder converters', () => {
  it('types values the way the engine compares them', () => {
    expect(typedValue('100')).toBe(100);
    expect(typedValue('true')).toBe(true);
    expect(typedValue('007')).toBe('007');
    expect(typedValue('web')).toBe('web');
  });

  it('builds conditions that match numbers typed into the builder', () => {
    const conditions = buildRulesEngineConditions('all', [row({ value: '100' })]);
    const rule = { trigger: 'lesson_completed', conditions: conditions!, actions: [{ type: 'award_xp', params: { amount: 5 } }] } as Parameters<typeof evaluateRule>[0];
    expect(evaluateRule(rule, event({ score: 100 })).matched).toBe(true);
    expect(evaluateRule(rule, event({ score: 99 })).matched).toBe(false);
  });

  it('turns an "is in" list into an array, which saving requires', () => {
    const conditions = buildRulesEngineConditions('any', [row({ field: 'payload.plan', operator: 'in', value: 'pro, team, 3' })]);
    expect(conditions).toEqual({ any: [{ field: 'payload.plan', operator: 'in', value: ['pro', 'team', 3] }] });
    expect(() => validateRuleForSave({ trigger: 'x', conditions, actions: [{ type: 'award_xp', params: { amount: 1 } }] })).not.toThrow();
  });

  it('reads totals and expressions back, not only plain fields', () => {
    const stored = {
      all: [
        { field: 'payload.score', operator: 'greater_than', value: 80 },
        { aggregate: { metric: 'sum', field: 'payload.amount', window: 'calendar_month' }, operator: 'greater_than_or_equal', value: 100 },
        { logic: { '>': [{ var: 'payload.qty' }, 2] } },
      ],
    };
    const parsed = parseRulesEngineConditions(stored as never);
    expect(parsed.conditions.map((c) => c.kind ?? 'field')).toEqual(['field', 'total', 'logic']);
    expect(buildRulesEngineConditions(parsed.matchMode, parsed.conditions)).toEqual(stored);
  });

  it('saves achievement actions with the key the engine awards by', () => {
    const [action] = parseRulesEngineActions([{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }]);
    const built = buildRulesEngineActions([action!]);
    expect(built).toEqual([{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }]);
    expect(() => validateRuleForSave({ trigger: 'x', actions: built })).not.toThrow();
    // Rules saved by the older builder used `key`, and still open.
    expect(parseRulesEngineActions([{ type: 'award_achievement', params: { key: 'old' } }])[0]!.achievementKey).toBe('old');
  });
});
