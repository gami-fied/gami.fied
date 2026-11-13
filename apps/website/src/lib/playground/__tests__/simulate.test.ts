import { describe, expect, it } from 'vitest';
import { scenarioById } from '../scenarios';
import { decodeState, encodeState, exportRules } from '../share';
import { MAX_EVENTS, ruleProblem, simulate, type PlaygroundEvent, type PlaygroundSetup } from '../simulate';

const NOW = new Date('2026-11-12T12:00:00Z');

const event = (type: string, payload: Record<string, unknown>, occurredAt: string, id = `evt_${Math.random()}`): PlaygroundEvent => ({ id, type, payload, occurredAt });

const setupFor = (id: string): PlaygroundSetup => {
  const scenario = scenarioById(id);
  if (!scenario) throw new Error(`No scenario ${id}`);
  return scenario.setup;
};

describe('simulate', () => {
  it('awards XP, levels and a one-time badge for the learning scenario', async () => {
    const setup = setupFor('learning');
    const events = [
      event('lesson_completed', { score: 70 }, '2026-11-10T18:00:00Z'),
      event('lesson_completed', { score: 100 }, '2026-11-11T18:00:00Z'),
    ];
    const { steps, totals } = await simulate(setup, events);

    // 50 per lesson, plus 25 for the perfect score.
    expect(totals.xp).toBe(125);
    expect(totals.level).toBe(2);
    expect(totals.badges.sort()).toEqual(['first_lesson', 'perfect_score']);
    // The first-lesson rule matches on the event that crosses the count, not every one after it.
    const firstRule = (index: number) => steps.filter((s) => !s.emitted)[index]!.rules.find((r) => r.ruleId === 'rule_first')!;
    expect(firstRule(0).matched).toBe(true);
    expect(firstRule(1).matched).toBe(false);
    expect(steps.flatMap((s) => s.effects).some((e) => e.kind === 'level' && e.level === 2)).toBe(true);
  });

  it('runs rules on the streak event, like the worker', async () => {
    const setup = setupFor('learning');
    const days = [7, 6, 5, 4, 3, 2, 1];
    const events = days.map((d) => event('lesson_completed', { score: 70 }, new Date(NOW.getTime() - d * 86_400_000).toISOString()));
    const { steps, totals } = await simulate(setup, events);

    expect(totals.streaks['daily_learning']?.current).toBe(7);
    expect(totals.badges).toContain('seven_day_streak');
    const streakSteps = steps.filter((s) => s.emitted);
    expect(streakSteps).toHaveLength(7);
    expect(streakSteps.at(-1)!.event.payload).toMatchObject({ streak: 'daily_learning', current: 7, change: 'extended' });
    // 7 lessons × 50, the week bonus of 200, and the ten-lesson badge has not been reached.
    expect(totals.xp).toBe(7 * 50 + 200);
    expect(totals.badges).not.toContain('ten_lessons');
  });

  it('resets a streak after a missed day with no freezes', async () => {
    const setup = setupFor('learning');
    const { totals, steps } = await simulate(setup, [
      event('lesson_completed', {}, '2026-11-01T18:00:00Z'),
      event('lesson_completed', {}, '2026-11-02T18:00:00Z'),
      event('lesson_completed', {}, '2026-11-05T18:00:00Z'),
    ]);
    expect(totals.streaks['daily_learning']?.current).toBe(1);
    expect(steps.flatMap((s) => s.effects).filter((e) => e.kind === 'streak').map((e) => e.kind === 'streak' && e.change)).toEqual(['started', 'extended', 'reset']);
  });

  it('sums a payload field over the calendar month', async () => {
    const setup = setupFor('shop');
    const { totals, steps } = await simulate(setup, [
      event('order_completed', { amount: 30 }, '2026-11-02T10:00:00Z'),
      event('order_completed', { amount: 45 }, '2026-11-08T10:00:00Z'),
      event('order_completed', { amount: 40 }, '2026-11-11T10:00:00Z'),
    ]);
    expect(totals.badges).toContain('big_spender');
    // 10 points per order, and none of them reached $50.
    expect(totals.wallets['points']).toBe(30);
    const last = steps.at(-1)!.rules.find((r) => r.ruleId === 'rule_big')!;
    expect(last.aggregates[0]).toMatchObject({ previous: 75, value: 115 });
  });

  it('counts different values for a unique aggregate', async () => {
    const setup = setupFor('fitness');
    const { totals } = await simulate(setup, [
      event('workout_logged', { kind: 'run', km: 5 }, '2026-11-02T10:00:00Z'),
      event('workout_logged', { kind: 'run', km: 5 }, '2026-11-03T10:00:00Z'),
      event('workout_logged', { kind: 'ride', km: 20 }, '2026-11-04T10:00:00Z'),
    ]);
    expect(totals.badges).not.toContain('all_rounder');
    const more = await simulate(setup, [
      event('workout_logged', { kind: 'run', km: 5 }, '2026-11-02T10:00:00Z'),
      event('workout_logged', { kind: 'ride', km: 20 }, '2026-11-04T10:00:00Z'),
      event('workout_logged', { kind: 'swim', km: 1 }, '2026-11-05T10:00:00Z'),
    ]);
    expect(more.totals.badges).toContain('all_rounder');
  });

  it('reports a rule that a real install would refuse, instead of running it', async () => {
    const setup: PlaygroundSetup = {
      ...setupFor('learning'),
      streaks: [],
      rules: [{ id: 'bad', name: 'Bad', enabled: true, definition: { trigger: 'lesson_completed', actions: [{ type: 'award_xp', params: { amount: 0 } }] } }],
    };
    const { steps, totals } = await simulate(setup, [event('lesson_completed', {}, '2026-11-02T10:00:00Z')]);
    expect(steps[0]!.rules[0]!.error).toMatch(/award_xp amount/);
    expect(totals.xp).toBe(0);
    expect(ruleProblem({ trigger: 'x', actions: [{ type: 'award_achievement', params: { key: 'old' } }] })).toMatch(/achievementKey/);
  });

  it('stops after the event limit', async () => {
    const setup = setupFor('learning');
    const many = Array.from({ length: MAX_EVENTS + 50 }, (_, i) => event('lesson_completed', {}, new Date(NOW.getTime() - i * 60_000).toISOString()));
    const { steps } = await simulate(setup, many);
    expect(steps.length).toBe(MAX_EVENTS);
  });
});

describe('sharing', () => {
  it('round-trips state through a link', async () => {
    const setup = setupFor('shop');
    const state = { version: 1 as const, scenario: 'shop', setup, events: [event('order_completed', { amount: 25 }, '2026-11-02T10:00:00Z', 'evt_1')] };
    const encoded = await encodeState(state);
    expect(encoded.startsWith('z.')).toBe(true);
    expect(await decodeState(encoded)).toEqual(state);
    expect(await decodeState('z.not-really')).toBeNull();
  });

  it('exports rules in the shape the API accepts, without empty conditions', () => {
    const rules = exportRules(setupFor('shop'));
    expect(rules[0]).toEqual({
      name: 'Points per order',
      enabled: true,
      trigger: 'order_completed',
      actions: [
        { type: 'award_currency', params: { currency: 'points', amount: 10 } },
        { type: 'award_xp', params: { amount: 20, reason: 'Order' } },
      ],
    });
    expect(rules.every((rule) => ruleProblem(rule) === null)).toBe(true);
  });
});
