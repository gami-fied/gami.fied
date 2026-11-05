import { validateChallengeInput } from '@gami/challenges';
import { validateLevelDefinitions } from '@gami/progression';
import { evaluateRule, validateRuleDefinition } from '@gami/rules';
import { describe, expect, it } from 'vitest';
import { DEMO_ACHIEVEMENTS, DEMO_CHALLENGE, DEMO_LEVELS, DEMO_RULES } from '../seed-data.js';

const lessonEvent = (score: number) => ({
  id: 'evt_test',
  projectId: 'prj_test',
  userId: 'usr_test',
  type: 'lesson_completed',
  payload: { score },
  occurredAt: new Date(),
});

describe('demo seed data', () => {
  it.each(DEMO_RULES)('$name is a valid rule definition', (rule) => {
    const { trigger, actions } = rule;
    const conditions = rule.conditions ?? undefined;
    expect(() => validateRuleDefinition({ trigger, conditions, actions })).not.toThrow();
  });

  it('only awards the perfect score badge for a score of 100', () => {
    const rule = DEMO_RULES.find((r) => r.id === 'rul_dev_03');
    expect(evaluateRule(rule, lessonEvent(100)).matched).toBe(true);
    expect(evaluateRule(rule, lessonEvent(99)).matched).toBe(false);
  });

  it('has a valid level curve', () => {
    expect(validateLevelDefinitions(DEMO_LEVELS).valid).toBe(true);
  });

  it('has a valid challenge', () => {
    expect(validateChallengeInput(DEMO_CHALLENGE)).toMatchObject({ valid: true });
  });

  it('only references achievements that exist', () => {
    const keys = new Set(DEMO_ACHIEVEMENTS.map((a) => a.key));
    const fromRules = DEMO_RULES.flatMap((r) => r.actions).flatMap((a) =>
      'achievementKey' in a.params ? [a.params.achievementKey] : []
    );
    const fromChallenge = DEMO_CHALLENGE.rewards.flatMap((r) =>
      r.type === 'achievement' ? [r.achievementKey] : []
    );
    expect([...fromRules, ...fromChallenge].every((key) => keys.has(key))).toBe(true);
  });
});
