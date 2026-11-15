import { validateRuleForSave } from '@gami/rules';
import { describe, expect, it } from 'vitest';
import { USE_CASES } from '../use-cases';

describe('use-case pages', () => {
  it('show rules the engine would accept', () => {
    for (const item of USE_CASES) {
      expect(() => validateRuleForSave(item.rule), item.slug).not.toThrow();
    }
  });

  it('have a unique address each', () => {
    expect(new Set(USE_CASES.map((item) => item.slug)).size).toBe(USE_CASES.length);
  });
});
