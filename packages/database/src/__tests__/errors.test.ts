import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../errors.js';

describe('isUniqueViolation', () => {
  it('finds the code on a raw driver error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('finds the code on a wrapped Drizzle error', () => {
    expect(isUniqueViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(true);
  });

  it('ignores other database errors', () => {
    expect(isUniqueViolation(new Error('Failed query', { cause: { code: '23503' } }))).toBe(false);
  });

  it.each([null, undefined, 'failed', new Error('plain')])('ignores %s', (value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });
});
