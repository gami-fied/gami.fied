import { describe, expect, it } from 'vitest';
import { evaluateRule, validateRuleDefinition } from '../index.js';
import { EventData } from '../types.js';

describe('@gami/rules - Core Rules Engine & Evaluator Test Suite', () => {
  const sampleEvent: EventData = {
    id: 'evt_123',
    projectId: 'prj_123',
    userId: 'usr_456',
    type: 'task.completed',
    payload: {
      difficulty: 'hard',
      score: 150,
      tags: ['gameplay', 'boss'],
      title: 'Defeat Dragon',
      extra: null,
    },
    occurredAt: '2026-08-13T12:00:00Z',
  };

  it('1. Trigger Matching: matches when rule.trigger === event.type, rejects otherwise', () => {
    const matchingRule = {
      trigger: 'task.completed',
      actions: [{ type: 'log' }],
    };
    const res1 = evaluateRule(matchingRule, sampleEvent);
    expect(res1.triggerMatched).toBe(true);
    expect(res1.matched).toBe(true);

    const nonMatchingRule = {
      trigger: 'task.started',
      actions: [{ type: 'log' }],
    };
    const res2 = evaluateRule(nonMatchingRule, sampleEvent);
    expect(res2.triggerMatched).toBe(false);
    expect(res2.matched).toBe(false);
  });

  it('2. Operators & Conditions: evaluates all 13 comparison operators', () => {
    // equals & not_equals
    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.difficulty', operator: 'not_equals', value: 'easy' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    // exists & not_exists
    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.score', operator: 'exists' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.missingField', operator: 'not_exists' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    // greater_than, greater_than_or_equal, less_than, less_than_or_equal
    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.score', operator: 'greater_than', value: 100 },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.score', operator: 'greater_than_or_equal', value: 150 },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.score', operator: 'less_than', value: 200 },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.score', operator: 'less_than_or_equal', value: 150 },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    // contains, starts_with, ends_with
    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.tags', operator: 'contains', value: 'boss' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.title', operator: 'starts_with', value: 'Defeat' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: { field: 'payload.title', operator: 'ends_with', value: 'Dragon' },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    // in & not_in
    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: {
            field: 'payload.difficulty',
            operator: 'in',
            value: ['medium', 'hard'],
          },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);

    expect(
      evaluateRule(
        {
          trigger: 'task.completed',
          conditions: {
            field: 'payload.difficulty',
            operator: 'not_in',
            value: ['easy', 'medium'],
          },
          actions: [{ type: 'log' }],
        },
        sampleEvent
      ).matched
    ).toBe(true);
  });

  it('3. Condition Tree & Logic Groups: evaluates nested ALL, ANY, and NOT groups', () => {
    const complexRule = {
      trigger: 'task.completed',
      conditions: {
        all: [
          { field: 'payload.difficulty', operator: 'equals', value: 'hard' },
          {
            any: [
              { field: 'payload.score', operator: 'greater_than', value: 100 },
              { field: 'payload.title', operator: 'equals', value: 'Easy Task' },
            ],
          },
          {
            not: { field: 'payload.difficulty', operator: 'equals', value: 'easy' },
          },
        ],
      },
      actions: [{ type: 'log' }],
    };

    const res = evaluateRule(complexRule, sampleEvent);
    expect(res.matched).toBe(true);
  });

  it('4. Rule Validation: rejects invalid triggers, excessive nesting, and missing actions', () => {
    // Missing trigger
    expect(() => validateRuleDefinition({ actions: [{ type: 'log' }] })).toThrow(
      'Rule trigger must be a non-empty string'
    );

    // Empty actions
    expect(() => validateRuleDefinition({ trigger: 't.c', actions: [] })).toThrow(
      'Rule must contain at least one action'
    );

    // Excessive nesting depth (> 5)
    const deepCondition = {
      all: [
        {
          all: [
            {
              all: [
                {
                  all: [
                    {
                      all: [
                        {
                          all: [{ field: 'x', operator: 'equals', value: 1 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() =>
      validateRuleDefinition({
        trigger: 't.c',
        conditions: deepCondition,
        actions: [{ type: 'log' }],
      })
    ).toThrow('nesting depth exceeds maximum allowed limit');
  });
});
