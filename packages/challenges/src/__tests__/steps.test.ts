import { describe, expect, it } from 'vitest';
import { challengeEvents, eventAdvances, periodEnd, periodKey, validateChallengeInput } from '../index.js';

const steps = [
  { name: 'Sign up', event: 'signed_up' },
  { name: 'Add a photo', event: 'photo_added' },
  { name: 'Post', event: 'posted', filters: [{ field: 'payload.words', operator: 'greater_than_or_equal', value: 20 }] },
];

describe('periods', () => {
  it('has no period for a one-off challenge', () => {
    expect(periodKey(null, new Date('2026-03-18T12:00:00Z'))).toBe('');
    expect(periodEnd(null, new Date())).toBeNull();
  });

  it('keys daily challenges by UTC day', () => {
    expect(periodKey('daily', new Date('2026-03-18T23:59:59Z'))).toBe('2026-03-18');
    expect(periodKey('daily', new Date('2026-03-19T00:00:00Z'))).toBe('2026-03-19');
    expect(periodEnd('daily', new Date('2026-03-18T12:00:00Z'))?.toISOString()).toBe('2026-03-19T00:00:00.000Z');
  });

  it('keys weekly challenges by the Monday that starts the week', () => {
    expect(periodKey('weekly', new Date('2026-03-18T12:00:00Z'))).toBe('2026-03-16'); // a Wednesday
    expect(periodKey('weekly', new Date('2026-03-22T23:00:00Z'))).toBe('2026-03-16'); // the Sunday
    expect(periodKey('weekly', new Date('2026-03-23T00:00:00Z'))).toBe('2026-03-23');
    expect(periodEnd('weekly', new Date('2026-03-18T12:00:00Z'))?.toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });
});

describe('which events move a challenge', () => {
  const always = () => true;
  const never = () => false;
  const counter = { trigger: 'order', type: 'counter' };
  const ordered = { trigger: 'signed_up', type: 'steps', steps };

  it('lists the events a challenge listens for', () => {
    expect(challengeEvents(counter)).toEqual(['order']);
    expect(challengeEvents(ordered)).toEqual(['signed_up', 'photo_added', 'posted']);
  });

  it('lets a counter take its own event only', () => {
    expect(eventAdvances(counter, 0, 'order', always)).toBe(true);
    expect(eventAdvances(counter, 0, 'refund', always)).toBe(false);
  });

  it('applies conditions on the challenge to every event', () => {
    const filtered = { ...counter, filters: [{ field: 'payload.total', operator: 'greater_than', value: 50 }] };
    expect(eventAdvances(filtered, 0, 'order', never)).toBe(false);
    expect(eventAdvances(filtered, 0, 'order', always)).toBe(true);
  });

  it('takes steps strictly in order', () => {
    expect(eventAdvances(ordered, 0, 'signed_up', always)).toBe(true);
    expect(eventAdvances(ordered, 0, 'posted', always)).toBe(false); // too early
    expect(eventAdvances(ordered, 1, 'photo_added', always)).toBe(true);
    expect(eventAdvances(ordered, 1, 'signed_up', always)).toBe(false); // already done
    expect(eventAdvances(ordered, 3, 'posted', always)).toBe(false); // nothing left
  });

  it('checks the conditions of the step being worked on', () => {
    const seen: unknown[] = [];
    const passes = (filters: unknown[]) => {
      seen.push(filters);
      return false;
    };
    expect(eventAdvances(ordered, 2, 'posted', passes)).toBe(false);
    expect(seen).toHaveLength(1);
    expect(eventAdvances(ordered, 0, 'signed_up', passes)).toBe(true); // that step has no conditions
  });
});

describe('validation', () => {
  const base = { key: 'onboarding', name: 'Onboarding', rewards: [{ type: 'xp', amount: 100 }] };

  it('accepts a steps challenge and derives its trigger and target', () => {
    const result = validateChallengeInput({ ...base, type: 'steps', steps });
    expect(result.valid).toBe(true);
    expect(result.sanitized).toMatchObject({ type: 'steps', trigger: 'signed_up', target: 3 });
  });

  it('accepts a repeating counter with conditions', () => {
    const result = validateChallengeInput({
      ...base,
      trigger: 'workout',
      target: 3,
      recurrence: 'weekly',
      filters: [{ field: 'payload.minutes', operator: 'greater_than_or_equal', value: 20 }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized).toMatchObject({ recurrence: 'weekly', filters: [{ field: 'payload.minutes' }] });
  });

  it.each([
    ['one step', { type: 'steps', steps: [steps[0]] }],
    ['a step with no event', { type: 'steps', steps: [{ name: 'A' }, { name: 'B', event: 'b' }] }],
    ['a step with no name', { type: 'steps', steps: [{ event: 'a' }, { name: 'B', event: 'b' }] }],
    ['more than ten steps', { type: 'steps', steps: Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, event: `e${i}` })) }],
    ['an unknown recurrence', { trigger: 'x', target: 1, recurrence: 'hourly' }],
    ['a condition on something outside the event', { trigger: 'x', target: 1, filters: [{ field: 'secret', operator: 'equals', value: 1 }] }],
    ['an unknown operator', { trigger: 'x', target: 1, filters: [{ field: 'payload.a', operator: 'matches', value: 1 }] }],
    ['an unknown type', { type: 'chain', trigger: 'x', target: 1 }],
  ])('rejects %s', (_label, extra) => {
    expect(validateChallengeInput({ ...base, ...extra }).valid).toBe(false);
  });
});
