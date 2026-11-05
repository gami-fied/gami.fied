/**
 * Demo content for `pnpm db:seed`. Kept free of database imports so a unit test
 * can run it through the real rule, level and challenge validators.
 */

export const DEMO_USER = {
  email: 'demo@gami.local',
  password: 'gami-demo-password',
  name: 'Demo Admin',
} as const;

export const DEMO_LEVELS = [
  { level: 1, name: 'Beginner', requiredXp: 0 },
  { level: 2, name: 'Learner', requiredXp: 100 },
  { level: 3, name: 'Scholar', requiredXp: 300 },
  { level: 4, name: 'Expert', requiredXp: 600 },
  { level: 5, name: 'Master', requiredXp: 1000 },
];

export const DEMO_ACHIEVEMENTS = [
  { key: 'first_lesson', name: 'First Lesson', description: 'Completed a first lesson.' },
  { key: 'perfect_score', name: 'Perfect Score', description: 'Scored 100 on a lesson.' },
  { key: 'dedicated_learner', name: 'Dedicated Learner', description: 'Completed 5 lessons.' },
];

export const DEMO_RULES = [
  {
    id: 'rul_dev_01',
    name: 'Lesson XP',
    description: 'Awards 50 XP for each completed lesson.',
    trigger: 'lesson_completed',
    conditions: null,
    actions: [{ type: 'award_xp', params: { amount: 50, reason: 'Lesson completed' } }],
  },
  {
    id: 'rul_dev_02',
    name: 'First Lesson Badge',
    description: 'Unlocks the First Lesson achievement.',
    trigger: 'lesson_completed',
    conditions: null,
    actions: [{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }],
  },
  {
    id: 'rul_dev_03',
    name: 'Perfect Score Badge',
    description: 'Unlocks Perfect Score when a lesson score is 100.',
    trigger: 'lesson_completed',
    conditions: { all: [{ field: 'payload.score', operator: 'equals', value: 100 }] },
    actions: [{ type: 'award_achievement', params: { achievementKey: 'perfect_score' } }],
  },
];

export const DEMO_CHALLENGE = {
  key: 'five_lessons',
  name: 'Five Lessons',
  description: 'Complete 5 lessons to earn a bonus.',
  trigger: 'lesson_completed',
  type: 'counter' as const,
  target: 5,
  rewards: [
    { type: 'xp' as const, amount: 200 },
    { type: 'achievement' as const, achievementKey: 'dedicated_learner' },
  ],
};

/** Lesson scores per demo user. One event is created for each score. */
export const DEMO_END_USERS = [
  { externalId: 'user_dev_01', name: 'Ada Lovelace', scores: [100, 92, 88, 100, 95, 97] },
  { externalId: 'user_dev_02', name: 'Grace Hopper', scores: [85, 100, 90, 76] },
  { externalId: 'user_dev_03', name: 'Alan Turing', scores: [99, 64, 100] },
  { externalId: 'user_dev_04', name: 'Katherine Johnson', scores: [81, 93] },
  { externalId: 'user_dev_05', name: 'Linus Pauling', scores: [70] },
];
