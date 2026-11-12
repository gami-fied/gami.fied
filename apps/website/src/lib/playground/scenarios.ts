/**
 * Ready-made playground setups. Each has its rules, what they can award, a few weeks of past
 * events for one player, and event presets for the composer.
 */
import type { LevelDefinitionInput } from '@gami/progression';
import type { PlaygroundEvent, PlaygroundSetup } from './simulate';

export interface EventPreset {
  label: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  setup: PlaygroundSetup;
  presets: EventPreset[];
  /** Past events, made relative to now when the scenario loads. */
  history: (now: Date) => PlaygroundEvent[];
}

const LEVELS: LevelDefinitionInput[] = [
  { level: 1, name: 'Novice', requiredXp: 0 },
  { level: 2, name: 'Explorer', requiredXp: 100 },
  { level: 3, name: 'Achiever', requiredXp: 250 },
  { level: 4, name: 'Expert', requiredXp: 500 },
  { level: 5, name: 'Legend', requiredXp: 1000 },
];

const DAY = 86_400_000;

/** An event `daysAgo` days before `now`, at a fixed hour so it lands on a predictable day. */
function at(now: Date, daysAgo: number, hour = 18): string {
  const day = new Date(now.getTime() - daysAgo * DAY);
  day.setUTCHours(hour, 0, 0, 0);
  return day.toISOString();
}

let counter = 0;
const eventId = () => `evt_${(++counter).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const SCENARIOS: Scenario[] = [
  {
    id: 'learning',
    name: 'Learning app',
    summary: 'XP for lessons, a daily streak, and badges for the first lesson, a perfect score and a week in a row.',
    setup: {
      timeZone: 'UTC',
      levels: LEVELS,
      currencies: [],
      achievements: [
        { id: 'ach_first', key: 'first_lesson', name: 'First lesson', description: 'Finished a first lesson' },
        { id: 'ach_perfect', key: 'perfect_score', name: 'Perfect score', description: 'Scored 100 on a lesson' },
        { id: 'ach_week', key: 'seven_day_streak', name: 'Seven-day streak', description: 'Learned seven days in a row' },
        { id: 'ach_ten', key: 'ten_lessons', name: 'Ten lessons', description: 'Finished ten lessons' },
      ],
      streaks: [{ key: 'daily_learning', name: 'Daily learning', triggerEvent: 'lesson_completed', cadence: 'daily', freezeEvery: 7, maxFreezes: 2 }],
      rules: [
        {
          id: 'rule_lesson',
          name: 'Lesson reward',
          enabled: true,
          definition: { trigger: 'lesson_completed', actions: [{ type: 'award_xp', params: { amount: 50, reason: 'Lesson finished' } }] },
        },
        {
          id: 'rule_first',
          name: 'First lesson badge',
          enabled: true,
          definition: {
            trigger: 'lesson_completed',
            conditions: { all: [{ aggregate: { metric: 'count', window: 'all_time' }, operator: 'greater_than_or_equal', value: 1 }] },
            actions: [{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }],
          },
        },
        {
          id: 'rule_perfect',
          name: 'Perfect score bonus',
          enabled: true,
          definition: {
            trigger: 'lesson_completed',
            conditions: { all: [{ field: 'payload.score', operator: 'equals', value: 100 }] },
            actions: [
              { type: 'award_xp', params: { amount: 25, reason: 'Perfect score' } },
              { type: 'award_achievement', params: { achievementKey: 'perfect_score' } },
            ],
          },
        },
        {
          id: 'rule_ten',
          name: 'Ten lessons',
          enabled: true,
          definition: {
            trigger: 'lesson_completed',
            conditions: { all: [{ aggregate: { metric: 'count', window: 'all_time' }, operator: 'greater_than_or_equal', value: 10 }] },
            actions: [{ type: 'award_achievement', params: { achievementKey: 'ten_lessons' } }],
          },
        },
        {
          id: 'rule_week',
          name: 'Seven-day streak bonus',
          enabled: true,
          definition: {
            trigger: 'streak_updated',
            conditions: {
              all: [
                { field: 'payload.streak', operator: 'equals', value: 'daily_learning' },
                { field: 'payload.current', operator: 'equals', value: 7 },
              ],
            },
            actions: [
              { type: 'award_xp', params: { amount: 200, reason: 'Seven days in a row' } },
              { type: 'award_achievement', params: { achievementKey: 'seven_day_streak' } },
            ],
          },
        },
      ],
    },
    presets: [
      { label: 'Lesson, score 80', type: 'lesson_completed', payload: { course: 'spanish-101', score: 80 } },
      { label: 'Lesson, perfect score', type: 'lesson_completed', payload: { course: 'spanish-101', score: 100 } },
      { label: 'Signed up', type: 'user_signed_up', payload: { source: 'web' } },
    ],
    history: (now) =>
      [8, 6, 5, 4, 3, 2, 1].map((daysAgo, index) => ({
        id: eventId(),
        type: 'lesson_completed',
        occurredAt: at(now, daysAgo),
        payload: { course: 'spanish-101', score: index === 3 ? 100 : 70 + index * 3 },
      })),
  },
  {
    id: 'shop',
    name: 'Shop with a points store',
    summary: 'Points for every order, double on large ones, and a badge for spending $100 in a month.',
    setup: {
      timeZone: 'UTC',
      levels: LEVELS,
      currencies: [{ key: 'points', name: 'Points', symbol: '★' }],
      achievements: [
        { id: 'ach_first_order', key: 'first_order', name: 'First order', description: 'Placed a first order' },
        { id: 'ach_big', key: 'big_spender', name: 'Big spender', description: 'Spent $100 in one month' },
      ],
      streaks: [],
      rules: [
        {
          id: 'rule_points',
          name: 'Points per order',
          enabled: true,
          definition: { trigger: 'order_completed', actions: [{ type: 'award_currency', params: { currency: 'points', amount: 10 } }, { type: 'award_xp', params: { amount: 20, reason: 'Order' } }] },
        },
        {
          id: 'rule_large',
          name: 'Large order bonus',
          enabled: true,
          definition: {
            trigger: 'order_completed',
            conditions: { all: [{ field: 'payload.amount', operator: 'greater_than_or_equal', value: 50 }] },
            actions: [{ type: 'award_currency', params: { currency: 'points', amount: 25 } }],
          },
        },
        {
          id: 'rule_first_order',
          name: 'First order badge',
          enabled: true,
          definition: { trigger: 'order_completed', actions: [{ type: 'award_achievement', params: { achievementKey: 'first_order' } }] },
        },
        {
          id: 'rule_big',
          name: 'Spent $100 this month',
          enabled: true,
          definition: {
            trigger: 'order_completed',
            conditions: { all: [{ aggregate: { metric: 'sum', field: 'payload.amount', window: 'calendar_month' }, operator: 'greater_than_or_equal', value: 100 }] },
            actions: [{ type: 'award_achievement', params: { achievementKey: 'big_spender' } }, { type: 'award_xp', params: { amount: 150, reason: 'Big spender' } }],
          },
        },
      ],
    },
    presets: [
      { label: 'Order of $25', type: 'order_completed', payload: { amount: 25, currency: 'USD' } },
      { label: 'Order of $60', type: 'order_completed', payload: { amount: 60, currency: 'USD' } },
      { label: 'Review written', type: 'review_written', payload: { stars: 5 } },
    ],
    history: (now) => [
      { id: eventId(), type: 'order_completed', occurredAt: at(now, 3), payload: { amount: 30, currency: 'USD' } },
      { id: eventId(), type: 'order_completed', occurredAt: at(now, 1), payload: { amount: 45, currency: 'USD' } },
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness app',
    summary: 'XP by distance, a weekly workout streak with freezes, and a badge for 50 km in a week.',
    setup: {
      timeZone: 'UTC',
      levels: LEVELS,
      currencies: [],
      achievements: [
        { id: 'ach_50k', key: 'fifty_km_week', name: '50 km week', description: 'Covered 50 km in one week' },
        { id: 'ach_variety', key: 'all_rounder', name: 'All-rounder', description: 'Tried three kinds of workout' },
      ],
      streaks: [{ key: 'weekly_workouts', name: 'Weekly workouts', triggerEvent: 'workout_logged', cadence: 'weekly', freezeEvery: 4, maxFreezes: 1 }],
      rules: [
        {
          id: 'rule_workout',
          name: 'Workout reward',
          enabled: true,
          definition: { trigger: 'workout_logged', actions: [{ type: 'award_xp', params: { amount: 30, reason: 'Workout' } }] },
        },
        {
          id: 'rule_long',
          name: 'Long run bonus',
          enabled: true,
          definition: {
            trigger: 'workout_logged',
            conditions: {
              all: [
                { field: 'payload.kind', operator: 'equals', value: 'run' },
                { field: 'payload.km', operator: 'greater_than_or_equal', value: 10 },
              ],
            },
            actions: [{ type: 'award_xp', params: { amount: 40, reason: 'Long run' } }],
          },
        },
        {
          id: 'rule_50k',
          name: '50 km in a week',
          enabled: true,
          definition: {
            trigger: 'workout_logged',
            conditions: { all: [{ aggregate: { metric: 'sum', field: 'payload.km', window: 'calendar_week' }, operator: 'greater_than_or_equal', value: 50 }] },
            actions: [{ type: 'award_achievement', params: { achievementKey: 'fifty_km_week' } }],
          },
        },
        {
          id: 'rule_variety',
          name: 'Three kinds of workout',
          enabled: true,
          definition: {
            trigger: 'workout_logged',
            conditions: { all: [{ aggregate: { metric: 'unique', field: 'payload.kind', window: 'all_time' }, operator: 'greater_than_or_equal', value: 3 }] },
            actions: [{ type: 'award_achievement', params: { achievementKey: 'all_rounder' } }],
          },
        },
      ],
    },
    presets: [
      { label: '5 km run', type: 'workout_logged', payload: { kind: 'run', km: 5 } },
      { label: '12 km run', type: 'workout_logged', payload: { kind: 'run', km: 12 } },
      { label: '20 km ride', type: 'workout_logged', payload: { kind: 'ride', km: 20 } },
      { label: '1 km swim', type: 'workout_logged', payload: { kind: 'swim', km: 1 } },
    ],
    history: (now) => [
      { id: eventId(), type: 'workout_logged', occurredAt: at(now, 22), payload: { kind: 'run', km: 8 } },
      { id: eventId(), type: 'workout_logged', occurredAt: at(now, 15), payload: { kind: 'ride', km: 25 } },
      { id: eventId(), type: 'workout_logged', occurredAt: at(now, 8), payload: { kind: 'run', km: 12 } },
      { id: eventId(), type: 'workout_logged', occurredAt: at(now, 2), payload: { kind: 'run', km: 6 } },
    ],
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((scenario) => scenario.id === id);

export { eventId };
