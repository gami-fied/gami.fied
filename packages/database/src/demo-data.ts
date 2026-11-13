/**
 * The setup every live demo starts with: a made-up language-learning app with a month of players.
 * Kept free of database imports so a unit test can run it through the real validators.
 *
 * Players and their activity come from a seeded random generator, so every demo looks lived-in
 * but tests can rely on the exact numbers.
 */

export const DEMO_APP_NAME = 'Lingo Leap';

export const DEMO_LEVELS = [
  { level: 1, name: 'Newcomer', requiredXp: 0 },
  { level: 2, name: 'Learner', requiredXp: 150 },
  { level: 3, name: 'Speaker', requiredXp: 400 },
  { level: 4, name: 'Conversationalist', requiredXp: 800 },
  { level: 5, name: 'Fluent', requiredXp: 1400 },
  { level: 6, name: 'Polyglot', requiredXp: 2200 },
];

export const DEMO_ACHIEVEMENTS = [
  { key: 'first_lesson', name: 'First lesson', description: 'Finished a first lesson.' },
  { key: 'perfect_score', name: 'Perfect score', description: 'Scored 100 on a lesson.' },
  { key: 'ten_lessons', name: 'Ten lessons', description: 'Finished ten lessons.' },
  { key: 'week_streak', name: 'Seven days in a row', description: 'Learned seven days in a row.' },
  { key: 'polyglot', name: 'Polyglot', description: 'Took lessons in three languages.' },
];

export const DEMO_CURRENCY = { key: 'gems', name: 'Gems', symbol: '💎' };

export const DEMO_REWARDS = [
  { key: 'dark_theme', name: 'Dark theme', description: 'Unlock the dark theme in the app.', cost: 60, stock: null, perUserLimit: 1 },
  { key: 'sticker_pack', name: 'Sticker pack', description: 'A pack of stickers, posted to you.', cost: 150, stock: 40, perUserLimit: 2 },
  { key: 'premium_month', name: 'A month of Premium', description: 'Every course, with no ads.', cost: 400, stock: 10, perUserLimit: 1 },
];

export const DEMO_STREAK = {
  key: 'daily_learning',
  name: 'Daily learning',
  description: 'A lesson every day.',
  triggerEvent: 'lesson_completed',
  cadence: 'daily' as const,
  timeZone: 'UTC',
  freezeEvery: 7,
  maxFreezes: 2,
};

export const DEMO_LEAGUE = {
  key: 'weekly_league',
  name: 'Weekly league',
  tiers: ['Bronze', 'Silver', 'Gold', 'Diamond'],
  groupSize: 20,
  promote: 4,
  relegate: 4,
  cadence: 'weekly' as const,
};

export const DEMO_CHALLENGE = {
  key: 'five_lessons',
  name: 'Five lessons',
  description: 'Finish five lessons for a bonus.',
  trigger: 'lesson_completed',
  type: 'counter' as const,
  target: 5,
  rewards: [{ type: 'xp' as const, amount: 100 }],
};

export const DEMO_RULES = [
  {
    name: 'Lesson reward',
    description: '50 XP and 5 gems for every lesson.',
    trigger: 'lesson_completed',
    conditions: null,
    actions: [
      { type: 'award_xp', params: { amount: 50, reason: 'Lesson finished' } },
      { type: 'award_currency', params: { currency: 'gems', amount: 5 } },
    ],
  },
  {
    name: 'First lesson badge',
    description: 'Unlocks First lesson on the first one.',
    trigger: 'lesson_completed',
    conditions: { all: [{ aggregate: { metric: 'count', window: 'all_time' }, operator: 'greater_than_or_equal', value: 1 }] },
    actions: [{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }],
  },
  {
    name: 'Perfect score bonus',
    description: '25 more XP and a badge for a score of 100.',
    trigger: 'lesson_completed',
    conditions: { all: [{ field: 'payload.score', operator: 'equals', value: 100 }] },
    actions: [
      { type: 'award_xp', params: { amount: 25, reason: 'Perfect score' } },
      { type: 'award_achievement', params: { achievementKey: 'perfect_score' } },
    ],
  },
  {
    name: 'Ten lessons',
    description: 'A badge for the tenth lesson.',
    trigger: 'lesson_completed',
    conditions: { all: [{ aggregate: { metric: 'count', window: 'all_time' }, operator: 'greater_than_or_equal', value: 10 }] },
    actions: [{ type: 'award_achievement', params: { achievementKey: 'ten_lessons' } }],
  },
  {
    name: 'Three languages',
    description: 'A badge for lessons in three different languages.',
    trigger: 'lesson_completed',
    conditions: { all: [{ aggregate: { metric: 'unique', field: 'payload.language', window: 'all_time' }, operator: 'greater_than_or_equal', value: 3 }] },
    actions: [{ type: 'award_achievement', params: { achievementKey: 'polyglot' } }],
  },
  {
    name: 'Seven-day streak bonus',
    description: '200 XP and a badge at seven days in a row.',
    trigger: 'streak_updated',
    conditions: {
      all: [
        { field: 'payload.streak', operator: 'equals', value: 'daily_learning' },
        { field: 'payload.current', operator: 'equals', value: 7 },
      ],
    },
    actions: [
      { type: 'award_xp', params: { amount: 200, reason: 'Seven days in a row' } },
      { type: 'award_achievement', params: { achievementKey: 'week_streak' } },
    ],
  },
];

const FIRST_NAMES = [
  'Amara', 'Bruno', 'Chen', 'Dalia', 'Emil', 'Farah', 'Goran', 'Hana', 'Ibrahim', 'Jonas', 'Keiko', 'Luca',
  'Maya', 'Nikolai', 'Olivia', 'Pedro', 'Quinn', 'Rania', 'Sven', 'Tariq', 'Uma', 'Viktor', 'Wen', 'Ximena',
  'Yusuf', 'Zara', 'Aiko', 'Bastian', 'Clara', 'Diego', 'Elif', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jamal',
];
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTVW';
const COUNTRIES = ['DE', 'BR', 'JP', 'IN', 'US', 'FR', 'NG', 'ES', 'SE', 'EG', 'MX', 'KR'];
const LANGUAGES = ['spanish', 'french', 'german', 'japanese', 'italian'];

/** A small seeded generator (mulberry32), so a demo's data is varied but repeatable. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoPlayer {
  externalId: string;
  name: string;
  country: string;
  /** Lessons, oldest first. */
  lessons: { daysAgo: number; hour: number; language: string; score: number }[];
}

/**
 * The players and a month of their lessons. Some learn nearly every day, some come and go, and a
 * few stopped a while ago, so streaks, boards and the store all have something to show.
 */
export function demoPlayers(seed: number, count = FIRST_NAMES.length): DemoPlayer[] {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  return FIRST_NAMES.slice(0, count).map((first, index) => {
    // How often this player learns, and when they last came back.
    const habit = index < 6 ? 0.92 : index < 18 ? 0.6 : 0.3;
    const lastDay = index % 9 === 8 ? 6 + Math.floor(random() * 10) : 0;
    const languages = LANGUAGES.slice(0, 1 + Math.floor(random() * (index % 4 === 0 ? 4 : 2)));
    const lessons: DemoPlayer['lessons'] = [];
    for (let daysAgo = 29; daysAgo >= lastDay; daysAgo--) {
      // The most regular players keep a run of every day for the last week or more.
      const certain = index < 6 && daysAgo < 10;
      if (!certain && random() > habit) continue;
      const perDay = random() < 0.25 ? 2 : 1;
      for (let n = 0; n < perDay; n++) {
        const roll = random();
        lessons.push({
          daysAgo,
          hour: 7 + Math.floor(random() * 14),
          language: pick(languages),
          score: roll > 0.85 ? 100 : 60 + Math.floor(random() * 39),
        });
      }
    }
    return {
      externalId: `learner_${String(index + 1).padStart(2, '0')}`,
      name: `${first} ${LAST_INITIALS[index % LAST_INITIALS.length]}.`,
      country: COUNTRIES[index % COUNTRIES.length]!,
      lessons,
    };
  });
}

/** Features a demo cannot use: anything that reaches outside the demo instance. */
export const DEMO_LOCKED_FEATURES = ['webhooks', 'integrations', 'connectors', 'campaigns', 'push', 'plugins'] as const;

/** Limits for every demo organization. */
export const DEMO_POLICY = {
  maxProjects: 1,
  maxMembers: 1,
  eventsPerMinute: 120,
  apiKeyMaxLifetimeDays: 1,
} as const;
