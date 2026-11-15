import { PUBLIC_ROUTES } from './routes.js';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (type: string) => ({ type: [type, 'null'] });
const listOf = (name: string, description: string): Schema => ({
  type: 'object',
  required: ['data'],
  properties: { data: { type: 'array', description, items: ref(name) } },
});

const TIMESTAMP = '2026-11-06T09:30:00.000Z';

const id = (description: string, example: string) => ({ type: 'string', description, example });
const text = (description: string, example: string) => ({ type: 'string', description, example });
const count = (description: string, example: number) => ({ type: 'integer', description, example });
const flag = (description: string, example: boolean) => ({ type: 'boolean', description, example });
const date = (description: string) => ({
  type: 'string',
  format: 'date-time',
  description,
  example: TIMESTAMP,
});
const optionalText = (description: string, example: string | null) => ({
  ...nullable('string'),
  description,
  example,
});
const optionalDate = (description: string) => ({
  ...nullable('string'),
  format: 'date-time',
  description,
  example: null,
});
const metadata = (description: string) => ({
  ...nullable('object'),
  description,
  additionalProperties: true,
  example: { plan: 'pro' },
});

const allFields = (properties: Record<string, Schema>) => Object.keys(properties);
const object = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  required: allFields(properties),
  properties,
});

const projectId = id('The project this belongs to.', 'prj_8f3k2');
const userId = id('Gami.Fied\'s ID for the user.', 'usr_1762421400000_a1b2c3d4');

const SCHEMAS: Record<string, Schema> = {
  User: object({
    id: userId,
    projectId,
    externalId: text('Your ID for this user. Unique in the project.', 'user_123'),
    name: optionalText('Display name.', 'Ada Lovelace'),
    email: optionalText('Email address.', 'ada@example.com'),
    avatarUrl: optionalText('Link to a profile picture.', 'https://example.com/ada.png'),
    rankingHidden: flag('Left out of every leaderboard (a shadow ban). The user is not told.', false),
    metadata: metadata('Anything you stored on the user.'),
    active: flag('False once the user is deactivated. Their events are then refused.', true),
    createdAt: date('When the user was created.'),
    updatedAt: date('When the user last changed.'),
  }),
  Level: object({
    id: id('Gami.Fied\'s ID for the level.', 'lvl_1762421400000_x7y8z'),
    projectId,
    level: count('Level number. Unique in the project.', 2),
    name: text('Level name.', 'Explorer'),
    description: optionalText('What the level means.', 'Finished the basics'),
    iconUrl: optionalText('Link to an icon.', null),
    enabled: flag('Whether the level counts towards progress.', true),
    requiredXp: count('Total XP needed to reach this level. Unique in the project.', 500),
    createdAt: date('When the level was created.'),
    updatedAt: date('When the level last changed.'),
  }),
  AchievementProgress: object({
    achievementId: id('ID of the achievement.', 'ach_1762421400000_q1w2e'),
    key: text('The achievement\'s key.', 'bookworm'),
    name: text('Display name.', 'Bookworm'),
    description: optionalText('How to earn it.', 'Finish lessons'),
    iconUrl: optionalText('Link to a badge image.', null),
    hidden: flag('A secret achievement, which players do not see until they earn it.', false),
    earned: flag('Whether the user has reached the first tier.', true),
    awardedAt: optionalDate('When the first tier was reached.'),
    measures: text('What it measures, in plain words.', 'lesson_completed: events'),
    tier: count('Highest tier reached. 0 means none yet.', 2),
    tierCount: count('How many tiers there are, counting the first.', 3),
    tierName: optionalText('Name of the tier reached, from the second tier up.', 'Silver'),
    value: count('What the user has so far.', 63),
    nextTarget: { ...nullable('number'), description: 'The next number to reach. Null once every tier is done.', example: 100 },
    fraction: { type: 'number', description: 'How far toward the next target, from 0 to 1.', example: 0.63 },
    complete: flag('Whether every tier is done.', false),
  }),
  Achievement: object({
    id: id('Gami.Fied\'s ID for the achievement.', 'ach_1762421400000_q1w2e'),
    projectId,
    key: text('Short name that rules use to award it. Unique in the project.', 'first_order'),
    name: text('Display name.', 'First order'),
    description: optionalText('How to earn it.', 'Place your first order'),
    iconUrl: optionalText('Link to a badge image.', null),
    enabled: flag('Whether it can still be awarded.', true),
    hidden: flag('A secret achievement. Players do not see it, or their progress, until they earn it.', false),
    criteria: {
      ...nullable('object'),
      description: 'How it is earned without a rule: `{ event, metric, field, window, target }`, or `{ metric: "streak", streak, target }` for a streak. Null when only rules and challenges grant it.',
      additionalProperties: true,
      example: { event: 'lesson_completed', metric: 'count', window: 'all_time', target: 10 },
    },
    tiers: {
      ...nullable('array'),
      description: 'Higher levels after the first, each with a `name`, a `target` above the one before, and optional `xp` given on reaching it.',
      items: { type: 'object', additionalProperties: true },
      example: [{ name: 'Silver', target: 50, xp: 100 }],
    },
    createdAt: date('When it was created.'),
    updatedAt: date('When it last changed.'),
  }),
  UserAchievement: object({
    id: id('ID of this award.', 'uach_1762421400000_r4t5y'),
    projectId,
    userId,
    achievementId: id('The achievement that was awarded.', 'ach_1762421400000_q1w2e'),
    eventId: optionalText('The event that led to the award, if any.', 'evt_1762421400000_u7i8o'),
    ruleExecutionId: optionalText('The rule run that gave the award, if any.', null),
    metadata: metadata('Extra details saved with the award.'),
    awardedAt: date('When it was awarded.'),
    achievementKey: text('The achievement\'s key.', 'first_order'),
    achievementName: text('The achievement\'s display name.', 'First order'),
    achievementDescription: optionalText('How to earn it.', 'Place your first order'),
    iconUrl: optionalText('Link to a badge image.', null),
  }),
  StreakDefinition: object({
    id: id('ID of the streak.', 'sdf_1762421400000_a1b2c3d4'),
    projectId,
    key: text('Your key for the streak. Unique in the project.', 'daily_lesson'),
    name: text('Display name.', 'Daily lesson'),
    description: optionalText('What counts.', 'Finish one lesson a day'),
    triggerEvent: text('The event type that counts as activity.', 'lesson_completed'),
    cadence: { type: 'string', enum: ['daily', 'weekly'], description: 'How often a user has to be active.', example: 'daily' },
    timeZone: text('IANA time zone for users who have none of their own.', 'UTC'),
    freezeEvery: count('A freeze is earned each time the streak reaches a multiple of this. 0 means never.', 7),
    maxFreezes: count('Most freezes a user can hold.', 2),
    enabled: flag('Whether activity is counted.', true),
    createdAt: date('When it was created.'),
    updatedAt: date('When it last changed.'),
  }),
  UserStreak: object({
    streakId: id('ID of the streak.', 'sdf_1762421400000_a1b2c3d4'),
    key: text('The streak\'s key.', 'daily_lesson'),
    name: text('The streak\'s display name.', 'Daily lesson'),
    cadence: { type: 'string', enum: ['daily', 'weekly'], description: 'How often the user has to be active.', example: 'daily' },
    current: count('Days or weeks in a row right now. 0 once it has ended, even before their next action.', 12),
    longest: count('The best the user has reached.', 30),
    freezes: count('Freezes the user holds. One is spent automatically to cover a missed period.', 1),
    atRisk: flag('True when the user has not yet been active in the current period.', false),
    timeZone: text('The zone used to decide where a day starts for this user.', 'Europe/London'),
    lastActivityAt: optionalDate('When the user last counted toward the streak.'),
  }),
  StreakChange: object({
    id: id('ID of this entry.', 'skh_1762421400000_a1b2c3d4'),
    streakKey: text('The streak\'s key.', 'daily_lesson'),
    change: { type: 'string', enum: ['started', 'extended', 'frozen', 'reset'], description: 'What happened.', example: 'extended' },
    current: count('The streak after the change.', 12),
    freezesUsed: count('Freezes spent to cover missed periods.', 0),
    freezesEarned: count('Freezes earned by this activity.', 1),
    brokenStreak: count('The streak that ended, for a `reset`.', 0),
    eventId: optionalText('The event that caused it.', 'evt_1762421400000_u7i8o'),
    createdAt: date('When it happened.'),
  }),
  StoreReward: object({
    id: id('ID of the reward.', 'rwd_1762421400000_a1b2c3d4'),
    key: text('Your key for the reward. Unique in the project.', 'free_coffee'),
    name: text('Display name.', 'Free coffee'),
    description: optionalText('What it is.', 'One coffee, any size'),
    imageUrl: optionalText('Link to a picture.', null),
    currency: text('Key of the currency it costs.', 'coins'),
    cost: count('How much it costs.', 500),
    stock: { ...nullable('integer'), description: 'Units left. Null means unlimited.', example: 40 },
    perUserLimit: { ...nullable('integer'), description: 'Most one person can redeem. Null means no limit.', example: 1 },
    kind: { type: 'string', enum: ['fulfilled_by_you', 'code'], description: '`code` hands out a code from a pool, and `fulfilled_by_you` leaves delivery to you, after a `reward.redeemed` webhook.', example: 'code' },
    enabled: flag('Whether it can be bought.', true),
  }),
  Wallet: object({
    currency: text('Key of the currency.', 'coins'),
    name: text('Display name.', 'Coins'),
    symbol: optionalText('A short symbol.', '🪙'),
    balance: count('What the user can spend now. Expired points are not counted.', 1200),
    expiringSoon: count('Points that expire in the next 7 days.', 100),
  }),
  Redemption: object({
    id: id('ID of the purchase.', 'rdm_1762421400000_a1b2c3d4'),
    reward: text('The reward name at the time.', 'Free coffee'),
    cost: count('What it cost.', 500),
    status: { type: 'string', enum: ['pending', 'fulfilled', 'cancelled'], description: '`pending` until delivered, `fulfilled` once delivered (a code is delivered at once), `cancelled` with the points refunded.', example: 'fulfilled' },
    code: optionalText('The code handed out, for a reward that uses codes.', 'COFFEE-7H2K'),
    duplicate: flag('True if this idempotency key was already used, so nothing was bought again.', false),
  }),
  Segment: object({
    id: id('ID of the segment.', 'seg_8c1f'),
    projectId: id('The project.', 'prj_1762421400000_a1b2c'),
    key: text('Your key for it, used as `?segment=`.', 'india'),
    name: text('Display name.', 'India'),
    description: optionalText('What it is for.', null),
    filter: { type: 'object', additionalProperties: true, description: '`{ match: "all" | "any", conditions: [{ field, operator, value }] }`.', example: { match: 'all', conditions: [{ field: 'metadata.country', operator: 'equals', value: 'IN' }] } },
    createdAt: date('When it was made.'),
    updatedAt: date('When it last changed.'),
  }),
  League: object({
    id: id('ID of the league.', 'lg_3d2a'),
    projectId: id('The project.', 'prj_1762421400000_a1b2c'),
    key: text('Your key for it.', 'weekly'),
    name: text('Display name.', 'Weekly league'),
    tiers: { type: 'array', items: { type: 'string' }, description: 'Tier names, lowest first.', example: ['Bronze', 'Silver', 'Gold'] },
    groupSize: count('Most players in one group.', 30),
    promote: count('How many move up from each group at the end of a season.', 5),
    relegate: count('How many move down.', 5),
    cadence: { type: 'string', enum: ['daily', 'weekly'], description: 'Season length, in UTC.', example: 'weekly' },
    enabled: flag('Whether players join it.', true),
    createdAt: date('When it was made.'),
    updatedAt: date('When it last changed.'),
    season: object({
      startsAt: date('When this season started.'),
      endsAt: date('When it ends.'),
      members: count('Players this season.', 120),
      groups: count('Groups this season.', 4),
    }),
  }),
  UserLeague: object({
    league: object({ key: text('The league\'s key.', 'weekly'), name: text('Its name.', 'Weekly league') }),
    tier: count('0 is the lowest tier.', 1),
    tierName: text('The tier\'s name.', 'Silver'),
    groupNo: count('The group within the tier.', 2),
    seasonEndsAt: date('When the season ends.'),
    standings: {
      type: 'array',
      description: 'The group\'s table, best first.',
      items: object({
        rank: count('Place in the group.', 1),
        userId: id('The player.', 'usr_1762421400000_a1b2c3d4'),
        externalId: text('Your ID for them.', 'user_123'),
        name: optionalText('Their name.', 'Ada'),
        avatarUrl: optionalText('Their picture.', null),
        xp: count('XP this season.', 840),
        zone: { type: 'string', enum: ['promotion', 'relegation', 'safe'], description: 'Whether they are on course to move up, move down, or stay.', example: 'promotion' },
      }),
    },
  }),
  Friend: object({
    id: id('The friend\'s ID.', 'usr_1762421400000_e5f6a7b8'),
    externalId: text('Your ID for them.', 'user_456'),
    name: optionalText('Their name.', 'Grace'),
    avatarUrl: optionalText('Their picture.', null),
    totalXp: count('Their all-time XP.', 1300),
  }),
  FeedItem: object({
    type: { type: 'string', enum: ['achievement', 'kudos', 'promotion'], description: 'What happened.', example: 'achievement' },
    at: date('When.'),
    userId: id('Who it happened to.', 'usr_1762421400000_a1b2c3d4'),
    name: optionalText('Their name.', 'Ada'),
    title: text('A short line to show.', 'Earned First order'),
    detail: optionalText('More detail, such as a kudos message.', null),
  }),
  ChallengeReward: {
    type: 'object',
    description: 'Either `{ "type": "xp", "amount": 100 }` or `{ "type": "achievement", "achievementKey": "first_order" }`.',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['xp', 'achievement'], example: 'xp' },
      amount: count('XP to award, when `type` is `xp`.', 100),
      achievementKey: text('Achievement to award, when `type` is `achievement`.', 'first_order'),
    },
  },
  Challenge: object({
    id: id('Gami.Fied\'s ID for the challenge.', 'chl_1762421400000_p0o9i'),
    projectId,
    key: text('Short name for the challenge. Unique in the project.', 'ten_orders'),
    name: text('Display name.', 'Ten orders'),
    description: optionalText('What users need to do.', 'Place ten orders'),
    iconUrl: optionalText('Link to an icon.', null),
    enabled: flag('Whether it is running.', true),
    trigger: text('The event type that counts towards it.', 'order_completed'),
    type: { type: 'string', enum: ['counter', 'steps'], description: '`counter` counts matching events. `steps` needs each step\'s event in order.', example: 'counter' },
    filters: {
      ...nullable('array'),
      description: 'Conditions an event\'s payload must meet to count, each `{ field, operator, value }`, for example `payload.score` greater than 80.',
      items: { type: 'object', additionalProperties: true },
      example: null,
    },
    steps: {
      ...nullable('array'),
      description: 'For a steps challenge: the events to complete in order, each `{ name, event, filters? }`.',
      items: { type: 'object', additionalProperties: true },
      example: null,
    },
    recurrence: { ...nullable('string'), enum: ['daily', 'weekly', null], description: 'Starts over each UTC day or week, so it can be done again. Null means it runs once.', example: null },
    target: count('How many events finish it.', 10),
    startAt: optionalDate('When it starts. Null means it has already started.'),
    endAt: optionalDate('When it ends. Null means it never ends.'),
    rewards: { type: 'array', description: 'What users get for finishing.', items: ref('ChallengeReward') },
    createdAt: date('When it was created.'),
    updatedAt: date('When it last changed.'),
  }),
  LedgerEntry: object({
    id: id('ID of this XP change.', 'xp_1762421400000_l2k3j'),
    projectId,
    userId,
    eventId: optionalText('The event that caused it, if any.', null),
    ruleId: optionalText('The rule that caused it, if any.', null),
    ruleExecutionId: optionalText('The rule run that caused it, if any.', null),
    idempotencyKey: optionalText('The key sent to prevent duplicates, if any.', 'adjust-4821'),
    amount: count('XP added, or removed if negative.', 50),
    reason: text('Why the XP changed.', 'manual_adjustment: Support credit'),
    metadata: metadata('Extra details saved with the change.'),
    createdAt: date('When it happened.'),
  }),
  LeaderboardEntry: {
    type: 'object',
    required: ['rank', 'userId', 'externalId', 'name', 'avatarUrl', 'xp'],
    properties: {
      rank: count('Position, starting at 1.', 1),
      userId,
      externalId: text('Your ID for this user.', 'user_123'),
      name: optionalText('Display name.', 'Ada Lovelace'),
      avatarUrl: optionalText('Link to a profile picture.', null),
      xp: count('XP earned in this period.', 1200),
      level: count('Current level number. Only present if the project has levels.', 3),
      levelName: text('Current level name. Only present if the project has levels.', 'Explorer'),
    },
  },
  ProgressLevel: object({
    number: count('Level number.', 2),
    name: text('Level name.', 'Explorer'),
    requiredXp: count('Total XP needed for this level.', 500),
  }),
  EventInput: {
    type: 'object',
    required: ['event'],
    properties: {
      event: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description: 'What happened. Rules match this exactly.',
        example: 'order_completed',
      },
      user_id: {
        type: 'string',
        maxLength: 128,
        description: 'Your ID for the user. A new user is created the first time an ID is seen. Leave it out for events with no user.',
        example: 'user_123',
      },
      payload: {
        type: 'object',
        additionalProperties: true,
        default: {},
        description: 'Details of the event, up to 64 KB. Rule conditions can read these.',
        example: { amount: 149.99 },
      },
      occurred_at: {
        type: 'string',
        format: 'date-time',
        description: 'When it happened, as an ISO 8601 UTC time. Defaults to now.',
        example: TIMESTAMP,
      },
      idempotency_key: {
        type: 'string',
        maxLength: 128,
        description: 'Makes a retry safe. See Avoiding duplicates. The `Idempotency-Key` header wins if both are sent.',
        example: 'order-4821',
      },
    },
  },
  EventRewards: object({
    evaluated: flag('False if the rules were still running after 5 seconds. Rewards still arrive later.', true),
    xpAwarded: count('XP this event gave.', 50),
    achievements: {
      type: 'array',
      description: 'Keys of achievements this event awarded.',
      items: { type: 'string' },
      example: ['first_order'],
    },
    totalXp: { ...nullable('integer'), description: 'The user\'s new total. Null if the event has no user.', example: 1250 },
    level: { ...nullable('integer'), description: 'The user\'s level number. Null if the event has no user or the project has no levels.', example: 3 },
  }),
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: text('Stable code to check in your own code.', 'BAD_REQUEST'),
          message: text('Explanation for developers.', 'Invalid event request schema'),
          requestId: text('Quote this when asking for help.', 'req_7d1c9'),
          details: { description: 'Which fields failed, when the request was invalid.' },
        },
      },
    },
  },
};

const ERRORS: Record<number, string> = {
  400: 'The request is invalid. `error.details` says which fields failed.',
  401: 'The API key or token is missing, invalid or revoked.',
  403: 'The key lacks the required scope, or the organization is suspended.',
  404: 'It doesn\'t exist in this project.',
  409: 'It conflicts with something that already exists.',
  413: 'The event payload is over 64 KB.',
  422: 'The request is valid but can\'t be applied.',
  429: 'Too many requests. Wait for the number of seconds in `Retry-After`.',
};

interface Param {
  name: string;
  in: 'path' | 'query' | 'header';
  description: string;
  required?: boolean;
  schema: Schema;
}

const pathParams = {
  userId: 'Your own ID for the user, or their Gami.Fied ID.',
  externalId: 'Your ID for the user.',
  achievementId: 'The achievement\'s ID, from List achievements.',
  challengeId: 'The challenge\'s ID, from List challenges.',
  levelId: 'The level\'s ID, from List levels.',
  rewardKey: 'The reward\'s key, from List store rewards.',
  segmentId: 'The segment\'s ID or key.',
  friendId: 'The friend: their Gami.Fied ID or yours.',
  boxKey: 'The box\'s key, from List mystery boxes and wheels.',
  passKey: 'The pass\'s key, from List season passes.',
  teamId: 'The team\'s ID or key.',
};

const meItems = (properties: Record<string, Schema>) =>
  object({ data: { type: 'array', description: 'The results.', items: object(properties) } });

/** One thing a player can be given. Which of the other fields is set depends on `type`. */
const PRIZE: Schema = {
  type: 'object',
  required: ['type'],
  description: 'A prize. `xp` and `currency` carry an `amount`; `currency`, `achievement` and `cosmetic` name what they give by key.',
  properties: {
    type: { type: 'string', enum: ['xp', 'currency', 'achievement', 'cosmetic'], description: 'What kind of prize it is.', example: 'currency' },
    amount: { type: 'integer', description: 'How much XP or currency.', example: 20 },
    currency: { type: 'string', description: 'Key of the currency.', example: 'gems' },
    achievement: { type: 'string', description: 'Key of the achievement.', example: 'first_order' },
    cosmetic: { type: 'string', description: 'Key of the cosmetic.', example: 'night_owl' },
  },
};
const prizeList = (description: string): Schema => ({ type: 'array', description, items: PRIZE });
/** A list whose rows are described in words, for the wide rows the dashboard reads. */
const rowsOf = (description: string): Schema => ({
  type: 'object',
  required: ['data'],
  properties: { data: { type: 'array', description, items: { type: 'object', additionalProperties: true } } },
});

const BOX_DROP = object({
  id: id('The item\'s ID.', 'itm_4f2a9c1d'),
  name: text('Display name.', '500 gems'),
  rare: flag('Whether the guarantee counts it as rare.', true),
  chance: { type: 'number', description: 'Chance of this item, as a percentage with two decimals.', example: 2.5 },
  prizes: prizeList('What the item gives.'),
});

const PLAYER_BOX = {
  key: text('The box\'s key.', 'daily_chest'),
  name: text('Display name.', 'Daily chest'),
  description: optionalText('What it is.', null),
  imageUrl: optionalText('Link to a picture.', null),
  kind: { type: 'string', enum: ['box', 'wheel'], description: 'How to show it. The draw is the same.', example: 'box' },
  cost: count('What a try costs. 0 is free.', 0),
  currency: optionalText('Key of the currency a try costs, or null when it is free.', null),
  currencyName: optionalText('Name of that currency.', null),
  currencySymbol: optionalText('Its symbol.', null),
  affordable: flag('Whether this player can pay for a try.', true),
  items: { type: 'array', description: 'The drop table: every item and its chance.', items: BOX_DROP },
  guaranteeAfter: { ...nullable('integer'), description: 'After this many tries in a row with nothing rare, the next gives a rare item. Null means no guarantee.', example: 10 },
  triesUntilGuarantee: { ...nullable('integer'), description: 'Tries left before one is sure to be rare. 0 means the next one is.', example: 7 },
  dailyLimit: { ...nullable('integer'), description: 'Most tries in a UTC day, or null for no limit.', example: 3 },
  triesLeftToday: { ...nullable('integer'), description: 'Tries left today.', example: 2 },
};

const BOX_OPEN = object({
  id: id('ID of this try.', 'lbo_3f9c2a61-6f0e-4c58-9d0b-2c1d6f0a7e11'),
  item: object({ id: id('The item\'s ID.', 'itm_4f2a9c1d'), name: text('What the player got.', '50 XP'), rare: flag('Whether it is a rare item.', false) }),
  prizes: prizeList('What was given.'),
  guaranteed: flag('True when the guarantee chose the item, not chance.', false),
  cost: count('What the try cost.', 0),
  createdAt: date('When.'),
  duplicate: flag('True if this idempotency key was used before, so nothing new happened.', false),
});

const LANE = (which: string) =>
  object({
    prizes: prizeList(`What the ${which} lane gives at this tier.`),
    claimed: flag('Whether the player has claimed it.', false),
    claimable: flag('Whether it is ready to claim now.', true),
  });

const PLAYER_PASS = {
  key: text('The pass\'s key.', 'season_1'),
  name: text('Display name.', 'Season 1'),
  description: optionalText('What it is.', null),
  status: { type: 'string', enum: ['upcoming', 'active', 'ended'], description: 'Where the season stands.', example: 'active' },
  startAt: date('When the season starts.'),
  endAt: date('When it ends. XP earned after this does not count.'),
  claimUntil: date('Rewards can be claimed until this time, a week after the end.'),
  xp: count('XP the player earned while the season has run.', 750),
  tier: count('How many tiers are unlocked.', 1),
  xpToNextTier: { ...nullable('integer'), description: 'Season XP still needed for the next tier. Null at the top.', example: 250 },
  premium: object({
    available: flag('Whether the pass has a premium lane to buy.', false),
    owned: flag('Whether the player holds it.', false),
    cost: { ...nullable('integer'), description: 'What it costs.', example: null },
    currency: optionalText('Key of the currency it costs.', null),
    currencyName: optionalText('Name of that currency.', null),
    currencySymbol: optionalText('Its symbol.', null),
    affordable: flag('Whether the player can pay for it.', false),
  }),
  tiers: {
    type: 'array',
    description: 'Each tier, lowest first.',
    items: object({ tier: count('Tier number, from 1.', 1), xp: count('Season XP that unlocks it.', 0), unlocked: flag('Whether the player has reached it.', true), free: LANE('free'), premium: LANE('premium') }),
  },
};

const PASS_CLAIM = object({
  pass: text('The pass\'s key.', 'season_1'),
  claimed: {
    type: 'array',
    description: 'What was given by this call. Empty when nothing was ready.',
    items: object({ tier: count('Tier number.', 1), lane: { type: 'string', enum: ['free', 'premium'], description: 'Which lane.', example: 'free' }, prizes: prizeList('What was given.') }),
  },
});
const PASS_CLAIM_BODY = {
  type: 'object',
  properties: {
    tier: { type: 'integer', minimum: 1, description: 'The tier to claim. Leave out, with `lane`, to claim everything that is ready.', example: 1 },
    lane: { type: 'string', enum: ['free', 'premium'], description: 'Which lane of that tier.', example: 'free' },
  },
};

const PLAYER_TEAM = {
  ...nullable('object'),
  description: 'The team, or null when the user is in none.',
  required: ['key', 'name', 'imageUrl', 'members', 'maxMembers', 'xp', 'rank', 'teams', 'roster'],
  properties: {
    key: text('The team\'s key.', 'red'),
    name: text('Display name.', 'Red team'),
    imageUrl: optionalText('Link to a picture.', null),
    members: count('How many players are in it.', 1),
    maxMembers: { ...nullable('integer'), description: 'Most members, or null for no limit.', example: null },
    xp: count('XP held by its members together.', 750),
    rank: { ...nullable('integer'), description: 'Its place among the teams by XP.', example: 1 },
    teams: count('How many teams there are.', 1),
    roster: {
      type: 'array',
      description: 'Up to 50 members, highest XP first.',
      items: object({ name: optionalText('Display name.', 'Ada'), avatarUrl: optionalText('Profile picture.', null), xp: count('Their XP.', 750), isMe: flag('Whether this is the user asked about.', true) }),
    },
  },
};
const TEAM_JOIN = object({ team: object({ key: text('The team\'s key.', 'red'), name: text('Display name.', 'Red team') }), joined: flag('False when they were already in it.', true) });
const TEAM_BODY = { type: 'object', required: ['team'], properties: { team: { type: 'string', description: 'The team\'s key or ID.', example: 'red' } } };

const PLAYER_GOAL = {
  key: text('The goal\'s key.', 'million_lessons'),
  name: text('Display name.', 'A million lessons'),
  description: optionalText('What it is.', null),
  scope: { type: 'string', enum: ['community', 'team'], description: 'Whether everyone shares one total, or each team has its own.', example: 'community' },
  target: count('The total to reach.', 1000000),
  progress: count('The total so far, for everyone or for the player\'s team.', 412000),
  percent: count('Progress as a whole percentage.', 41),
  completed: flag('Whether the target was reached.', false),
  completedAt: optionalDate('When it was reached.'),
  myContribution: count('How much this player added.', 12),
  endsAt: optionalDate('When it stops counting, if it has an end.'),
  open: flag('Whether events still count.', true),
  rewards: prizeList('What every contributor gets when the target is reached.'),
};

const PLAYER_COSMETIC = {
  key: text('The cosmetic\'s key.', 'night_owl'),
  name: text('Display name.', 'Night owl'),
  description: optionalText('What it is.', null),
  kind: { type: 'string', enum: ['title', 'frame', 'item'], description: 'A player wears one title and one frame, and any number of items.', example: 'title' },
  imageUrl: optionalText('Link to a picture.', null),
  owned: flag('Whether the player owns it.', true),
  equipped: flag('Whether they are wearing it.', false),
  achievement: { ...nullable('object'), description: 'The achievement that unlocks it, if one does.', required: ['key', 'name'], properties: { key: text('Its key.', 'first'), name: text('Its name.', 'First') } },
  cost: { ...nullable('integer'), description: 'What it costs to buy, or null when it is not for sale.', example: null },
  currency: optionalText('Key of the currency it costs.', null),
  currencySymbol: optionalText('Its symbol.', null),
  affordable: flag('Whether the player can pay for it.', false),
};
const EQUIP = object({ key: text('The cosmetic\'s key.', 'night_owl'), kind: text('Its kind.', 'title'), equipped: flag('Whether it is worn now.', true) });

const PLAYER_JOURNEY = {
  key: text('The journey\'s key.', 'onboarding'),
  name: text('Display name.', 'Getting started'),
  description: optionalText('What it is.', null),
  completed: flag('Whether every step is finished.', false),
  stepsDone: count('How many steps are finished.', 0),
  rewards: prizeList('What finishing the last step gives.'),
  steps: {
    type: 'array',
    description: 'The steps, in order.',
    items: object({
      challenge: text('The challenge\'s key.', 'ten'),
      name: text('Display name.', 'Ten'),
      description: optionalText('What to do.', null),
      target: count('How many events finish it.', 10),
      progress: count('Counted so far.', 0),
      completed: flag('Whether it is finished.', false),
      locked: flag('True until every step before it is finished. Events do not count for a locked step.', false),
    }),
  },
};

const userDocs = (what: string) => `Uses your own ID for the user, or their Gami.Fied ID. ${what}`;

const query = (name: string, description: string, schema: Schema): Param => ({
  name,
  in: 'query',
  description,
  schema,
});

const PAGE = query('page', 'Page number.', { type: 'integer', minimum: 1, default: 1 });
const limit = (fallback: number) =>
  query('limit', 'Results per page.', { type: 'integer', minimum: 1, maximum: 100, default: fallback });
const PERIOD_SCHEMA = {
  type: 'string',
  enum: ['all_time', 'daily', 'weekly', 'monthly'],
  default: 'all_time',
};
const PERIOD = query('period', 'Time period to rank. Periods use UTC.', PERIOD_SCHEMA);
const IDEMPOTENCY_HEADER: Param = {
  name: 'Idempotency-Key',
  in: 'header',
  description: 'Retrying with the same key can\'t apply the change twice.',
  schema: { type: 'string', maxLength: 128 },
};

interface Doc {
  tag: string;
  description: string;
  status: number;
  responseDescription: string;
  response: Schema;
  errors?: number[];
  parameters?: Param[];
  body?: Schema;
  bodyRequired?: boolean;
  example?: unknown;
}

const USER_BODY_PROPERTIES = {
  name: { ...nullable('string'), maxLength: 128, description: 'Display name.', example: 'Ada Lovelace' },
  email: { ...nullable('string'), format: 'email', description: 'Email address. Send an empty string to clear it.', example: 'ada@example.com' },
  avatarUrl: { ...nullable('string'), format: 'uri', maxLength: 512, description: 'Link to a profile picture. Send an empty string to clear it.', example: 'https://example.com/ada.png' },
};

const LEVEL_BODY_PROPERTIES = {
  level: { type: 'integer', minimum: 1, description: 'Level number. Unique in the project.', example: 3 },
  name: { type: 'string', minLength: 1, maxLength: 128, description: 'Level name.', example: 'Veteran' },
  description: { type: 'string', maxLength: 1024, description: 'What the level means.' },
  iconUrl: { type: 'string', format: 'uri', description: 'Link to an icon.' },
  requiredXp: { type: 'integer', minimum: 0, description: 'Total XP needed. Unique in the project, and higher levels must need more.', example: 2000 },
  enabled: { type: 'boolean', default: true, description: 'Whether the level counts towards progress.' },
};

const summary = (properties: Record<string, Schema>) => object(properties);

/** Everything about a public route that the route table doesn't say. Keyed by method and path. */
const DOCS: Record<string, Doc> = {
  'GET /users': {
    tag: 'Users',
    description: 'Lists the project\'s users, newest first by default.',
    status: 200,
    responseDescription: 'One page of users.',
    parameters: [
      PAGE,
      limit(25),
      query('search', 'Matches part of a name or external ID, ignoring case.', { type: 'string' }),
      query('sort', 'Order of the results.', { type: 'string', enum: ['newest', 'oldest', 'name'], default: 'newest' }),
    ],
    response: object({
      page: count('Current page.', 1),
      limit: count('Results per page.', 25),
      total: count('Users matching across all pages.', 240),
      users: { type: 'array', description: 'The users on this page.', items: ref('User') },
    }),
  },
  'POST /users': {
    tag: 'Users',
    description: 'Creates a user. You often don\'t need this, because sending an event with a new `user_id` creates the user for you.',
    status: 201,
    responseDescription: 'The new user.',
    response: ref('User'),
    errors: [400, 409],
    body: {
      type: 'object',
      required: ['externalId'],
      properties: {
        externalId: { type: 'string', minLength: 1, maxLength: 128, description: 'Your ID for this user. Unique in the project.', example: 'user_456' },
        ...USER_BODY_PROPERTIES,
        metadata: { type: 'object', additionalProperties: true, default: {}, description: 'Anything you want to store on the user.', example: { plan: 'pro' } },
      },
    },
    example: { externalId: 'user_456', name: 'Ada Lovelace', email: 'ada@example.com', metadata: { plan: 'pro' } },
  },
  'GET /users/by-external-id/:externalId': {
    tag: 'Users',
    description: 'Finds a user from your own ID. Other user endpoints accept your ID too, so you only need this if you want it kept apart from Gami.Fied IDs.',
    status: 200,
    responseDescription: 'The user.',
    response: ref('User'),
    errors: [404],
  },
  'GET /users/:userId': {
    tag: 'Users',
    description: 'Gets one user.',
    status: 200,
    responseDescription: 'The user.',
    response: ref('User'),
    errors: [404],
  },
  'PATCH /users/:userId': {
    tag: 'Users',
    description: 'Changes a user. Only the fields you send change. Set `active` to `true` to bring back a deactivated user.',
    status: 200,
    responseDescription: 'The updated user.',
    response: ref('User'),
    errors: [400, 404],
    body: {
      type: 'object',
      properties: {
        ...USER_BODY_PROPERTIES,
        metadata: { type: 'object', additionalProperties: true, description: 'Replaces the stored metadata.', example: { plan: 'team' } },
        active: { type: 'boolean', description: 'False deactivates the user, and true brings them back.' },
      },
    },
    example: { name: 'Ada King', metadata: { plan: 'team' } },
  },
  'DELETE /users/:userId': {
    tag: 'Users',
    description: 'Deactivates a user and keeps their history. Events for them are refused until you set `active` back to `true`. To remove someone\'s data for good, use Permanently erase a user.',
    status: 200,
    responseDescription: 'The deactivated user.',
    response: object({
      success: flag('Always true.', true),
      message: text('What happened.', 'User account deactivated successfully'),
      user: ref('User'),
    }),
    errors: [404],
  },
  'POST /users/:userId/tokens/revoke': {
    tag: 'Users',
    description: 'Ends every player token made for this user so far. Call it when they sign out of your app, so a token left in a browser stops working before it expires. Tokens made afterwards work as usual.',
    status: 200,
    responseDescription: 'Their earlier tokens no longer work.',
    response: object({ revoked: flag('Always true.', true) }),
    errors: [404],
  },
  'POST /users/:userId/erase': {
    tag: 'Users',
    description: 'Deletes a user and their personal data for good, for requests such as GDPR erasure. This can\'t be undone, so the body must confirm it.',
    status: 200,
    responseDescription: 'The user is gone.',
    response: object({
      success: flag('Always true.', true),
      message: text('What happened.', 'User erased permanently'),
    }),
    errors: [400, 404],
    body: {
      type: 'object',
      required: ['confirm'],
      properties: { confirm: { type: 'boolean', enum: [true], description: 'Must be `true`.', example: true } },
    },
    example: { confirm: true },
  },
  'GET /users/:userId/progress': {
    tag: 'Levels',
    description: 'Gets a user\'s level, and how far they are from the next one. Returns 404 if the project has no enabled levels.',
    status: 200,
    responseDescription: 'The user\'s progress.',
    errors: [404],
    response: object({
      projectId,
      userId,
      totalXp: count('The user\'s total XP.', 750),
      level: ref('ProgressLevel'),
      nextLevel: { ...nullable('object'), description: 'The next level. Null at the top level.', properties: SCHEMAS.ProgressLevel!.properties },
      xpIntoLevel: count('XP earned since reaching this level.', 250),
      xpToNextLevel: { ...nullable('integer'), description: 'XP still needed. Null at the top level.', example: 750 },
      progressPercent: count('Percent of the way to the next level.', 25),
      isMaxLevel: flag('Whether this is the top level.', false),
    }),
  },
  'GET /users/:userId/xp': {
    tag: 'XP',
    description: 'Gets a user\'s total XP. An ID that doesn\'t match any user returns `0` rather than an error.',
    status: 200,
    responseDescription: 'The balance.',
    response: object({ projectId, userId, totalXp: count('The user\'s total XP.', 750) }),
  },
  'GET /users/:userId/xp/ledger': {
    tag: 'XP',
    description: 'Lists every change to a user\'s XP, newest first.',
    status: 200,
    responseDescription: 'One page of XP changes.',
    parameters: [PAGE, limit(20)],
    response: object({
      projectId,
      userId,
      page: count('Current page.', 1),
      limit: count('Results per page.', 20),
      total: count('Changes across all pages.', 42),
      entries: { type: 'array', description: 'The changes on this page.', items: ref('LedgerEntry') },
      data: { type: 'array', description: 'The same list as `entries`.', items: ref('LedgerEntry') },
    }),
  },
  'POST /users/:userId/xp/adjust': {
    tag: 'XP',
    description: 'Adds or removes XP by hand, for example a support credit. Send a negative amount to remove XP. Returns 200 instead of 201 when the idempotency key was already used, and nothing changes.',
    status: 201,
    responseDescription: 'The new XP change.',
    parameters: [IDEMPOTENCY_HEADER],
    errors: [400, 404, 422],
    response: {
      allOf: [ref('LedgerEntry')],
      type: 'object',
      properties: {
        actionIndex: count('Position within the rule run. Always 0 here.', 0),
        updatedAt: date('When the entry last changed.'),
        duplicate: flag('True if this key was already used.', false),
      },
    },
    body: {
      type: 'object',
      required: ['amount', 'reason'],
      properties: {
        amount: { type: 'integer', minimum: -1000000, maximum: 1000000, description: 'XP to add, or remove if negative. Can\'t be 0.', example: 50 },
        reason: { type: 'string', minLength: 1, maxLength: 256, description: 'Why. Shown in XP history.', example: 'Support credit' },
        metadata: { type: 'object', additionalProperties: true, description: 'Extra details to save.' },
        idempotencyKey: { type: 'string', maxLength: 128, description: 'Makes a retry safe. The `Idempotency-Key` header wins if both are sent.', example: 'adjust-4821' },
      },
    },
    example: { amount: 50, reason: 'Support credit', idempotencyKey: 'adjust-4821' },
  },
  'GET /rewards': {
    tag: 'Store',
    description: 'Lists the rewards people can buy, enabled or not, with stock and cost.',
    status: 200,
    responseDescription: 'The rewards.',
    response: listOf('StoreReward', 'The rewards.'),
  },
  'GET /users/:userId/wallets': {
    tag: 'Store',
    description: 'Gets a user\'s balance in each currency. Expired points are not counted.',
    status: 200,
    responseDescription: 'One balance per currency.',
    response: listOf('Wallet', 'The balances.'),
    errors: [404],
  },
  'POST /users/:userId/rewards/:rewardKey/redeem': {
    tag: 'Store',
    description: 'Buys a reward for a user. The points, the stock, the user\'s limit and any code change together, so two people cannot take the last one. Fails with 409 and a `code` of `INSUFFICIENT_POINTS`, `OUT_OF_STOCK`, `OUT_OF_CODES` or `LIMIT_REACHED`. A `reward.redeemed` webhook is sent so you can ship it. Send an idempotency key so a retry does not buy twice.',
    status: 201,
    responseDescription: 'The purchase. Returns 200 instead of 201 when the key was used before.',
    errors: [404, 409],
    response: ref('Redemption'),
    body: {
      type: 'object',
      properties: {
        idempotencyKey: { type: 'string', maxLength: 128, description: 'Makes a retry safe.', example: 'order-4821-reward' },
      },
    },
    example: { idempotencyKey: 'order-4821-reward' },
  },
  'GET /boxes': {
    tag: 'Store',
    description: 'Lists the mystery boxes and wheels, enabled or not. Each row has the box\'s settings, its `items` with their weights, a `dropTable` with each item\'s chance as a percentage, and how many times it was opened and by how many players.',
    status: 200,
    responseDescription: 'The boxes.',
    response: rowsOf('The boxes.'),
  },
  'GET /users/:userId/boxes': {
    tag: 'Store',
    description: userDocs('Lists the boxes this user can open, with the drop table, whether they can pay, how many tries they have left today, and how far they are from the guarantee.'),
    status: 200,
    responseDescription: 'The boxes.',
    errors: [404],
    response: meItems(PLAYER_BOX),
  },
  'POST /users/:userId/boxes/:boxKey/open': {
    tag: 'Store',
    description: 'Opens a box for a user: one try gives one item, picked by weight. The cost, the draw and the prizes happen together or not at all. After `guaranteeAfter` tries in a row with nothing rare, the try is drawn from the rare items only. Fails with 409 and a `code` of `INSUFFICIENT_POINTS` or `LIMIT_REACHED`. A `box.opened` webhook is sent. Send an idempotency key so a retry does not open twice.',
    status: 201,
    responseDescription: 'What the try gave. Returns 200 instead of 201 when the key was used before.',
    errors: [404, 409],
    response: BOX_OPEN,
    body: { type: 'object', properties: { idempotencyKey: { type: 'string', maxLength: 128, description: 'Makes a retry safe.', example: 'order-4821-box' } } },
    example: { idempotencyKey: 'order-4821-box' },
  },
  'GET /passes': {
    tag: 'Store',
    description: 'Lists the season passes. Each row has the season\'s dates, its `tiers` with the free and premium prizes, what the premium lane costs, and how many players have started it and hold the premium lane.',
    status: 200,
    responseDescription: 'The passes.',
    response: rowsOf('The passes.'),
  },
  'GET /users/:userId/passes': {
    tag: 'Store',
    description: userDocs('Lists each pass that is running or can still be claimed from, with the XP the user earned this season, each tier, and what is ready to claim.'),
    status: 200,
    responseDescription: 'The passes.',
    errors: [404],
    response: meItems(PLAYER_PASS),
  },
  'POST /users/:userId/passes/:passKey/claim': {
    tag: 'Store',
    description: 'Gives a user the rewards of tiers they have reached. Send a `tier` and a `lane` for one reward, or neither to claim everything that is ready. Each reward is given once. Fails with 409 and a `code` of `TIER_LOCKED`, `PREMIUM_REQUIRED`, `ALREADY_CLAIMED`, `PASS_NOT_STARTED` or `PASS_ENDED`.',
    status: 200,
    responseDescription: 'What was given.',
    errors: [404, 409],
    response: PASS_CLAIM,
    body: PASS_CLAIM_BODY,
    example: {},
  },
  'POST /users/:userId/passes/:passKey/premium': {
    tag: 'Store',
    description: 'Gives a user the premium lane without charging points, for example after they paid you. Doing it again changes nothing.',
    status: 200,
    responseDescription: 'They hold the premium lane.',
    errors: [404],
    response: object({ pass: text('The pass\'s key.', 'season_1'), premium: flag('Always true.', true) }),
  },
  'GET /cosmetics': {
    tag: 'Store',
    description: 'Lists the cosmetics: titles, avatar frames and profile items. Each row has its kind, the achievement that unlocks it, what it costs, and how many players own it.',
    status: 200,
    responseDescription: 'The cosmetics.',
    response: rowsOf('The cosmetics.'),
  },
  'GET /users/:userId/cosmetics': {
    tag: 'Store',
    description: userDocs('Lists every cosmetic as this user sees it: owned, worn, and how to get the rest.'),
    status: 200,
    responseDescription: 'The cosmetics.',
    errors: [404],
    response: meItems(PLAYER_COSMETIC),
  },
  'POST /users/:userId/cosmetics': {
    tag: 'Store',
    description: 'Gives a user a cosmetic, for example as a gift. Doing it again changes nothing.',
    status: 200,
    responseDescription: 'Done.',
    errors: [400, 404],
    response: object({ key: text('The cosmetic\'s key.', 'night_owl'), given: flag('False when they already had it.', true) }),
    body: { type: 'object', required: ['cosmetic'], properties: { cosmetic: { type: 'string', description: 'The cosmetic\'s key.', example: 'night_owl' } } },
    example: { cosmetic: 'night_owl' },
  },
  'GET /teams': {
    tag: 'Social',
    description: 'Lists the teams with their size and the XP their members hold together, highest first. This is also the team board.',
    status: 200,
    responseDescription: 'The teams.',
    response: meItems({
      id: id('The team\'s ID.', 'team_3f9c2a61-6f0e-4c58-9d0b-2c1d6f0a7e11'),
      key: text('The team\'s key.', 'red'),
      name: text('Display name.', 'Red team'),
      imageUrl: optionalText('Link to a picture.', null),
      maxMembers: { ...nullable('integer'), description: 'Most members, or null for no limit.', example: null },
      createdAt: date('When it was made.'),
      members: count('How many players are in it.', 12),
      xp: count('XP held by its members together.', 8400),
      rank: count('Its place by XP.', 1),
    }),
  },
  'GET /teams/:teamId/members': {
    tag: 'Social',
    description: 'Lists up to 500 members of a team, highest XP first.',
    status: 200,
    responseDescription: 'The team and its members.',
    errors: [404],
    response: object({
      team: { type: 'object', description: 'The team.', additionalProperties: true },
      data: {
        type: 'array',
        description: 'The members.',
        items: object({
          userId,
          externalId: text('Your ID for this user.', 'user_123'),
          name: optionalText('Display name.', 'Ada'),
          avatarUrl: optionalText('Profile picture.', null),
          xp: count('Their XP.', 750),
          joinedAt: date('When they joined.'),
        }),
      },
    }),
  },
  'GET /users/:userId/team': {
    tag: 'Social',
    description: userDocs('Gets the user\'s team with its place and members. A user is in one team at a time.'),
    status: 200,
    responseDescription: 'The team.',
    errors: [404],
    response: object({ team: PLAYER_TEAM }),
  },
  'POST /users/:userId/team': {
    tag: 'Social',
    description: 'Puts a user in a team. A user in another team moves. Fails with 409 `TEAM_FULL` when the team has a size limit and is at it.',
    status: 200,
    responseDescription: 'They are in the team.',
    errors: [400, 404, 409],
    response: TEAM_JOIN,
    body: TEAM_BODY,
    example: { team: 'red' },
  },
  'DELETE /users/:userId/team': {
    tag: 'Social',
    description: 'Takes a user out of their team. It is not an error if they were in none.',
    status: 204,
    responseDescription: 'Done.',
    errors: [404],
    response: {},
  },
  'GET /goals': {
    tag: 'Challenges',
    description: 'Lists the shared goals. Each row has the goal\'s settings, how many players contributed and were paid, and its `progress`: one line for a community goal, or one per team for a team goal.',
    status: 200,
    responseDescription: 'The goals.',
    response: rowsOf('The goals.'),
  },
  'GET /users/:userId/goals': {
    tag: 'Challenges',
    description: userDocs('Lists the shared goals this user can see, with the total so far (everyone\'s, or their team\'s for a team goal) and how much they added. A team goal also carries `team`, which is null when the user is in no team.'),
    status: 200,
    responseDescription: 'The goals.',
    errors: [404],
    response: { type: 'object', required: ['data'], properties: { data: { type: 'array', description: 'The goals.', items: { type: 'object', required: Object.keys(PLAYER_GOAL), properties: { ...PLAYER_GOAL, team: { ...nullable('object'), description: 'For a team goal, the user\'s team.', additionalProperties: true } } } } } },
  },
  'GET /journeys': {
    tag: 'Challenges',
    description: 'Lists the journeys. Each row has its `steps` (challenge keys, in order), the prizes for finishing, and how many players finished it.',
    status: 200,
    responseDescription: 'The journeys.',
    response: rowsOf('The journeys.'),
  },
  'GET /users/:userId/journeys': {
    tag: 'Challenges',
    description: userDocs('Lists the journeys with this user\'s progress on each step, and whether the step is open yet.'),
    status: 200,
    responseDescription: 'The journeys.',
    errors: [404],
    response: meItems(PLAYER_JOURNEY),
  },
  'GET /leaderboard-prizes': {
    tag: 'Leaderboard',
    description: 'Lists the prizes for places on the daily, weekly and monthly boards. Each row has the period, the range of places, the prizes, and the last period that was paid.',
    status: 200,
    responseDescription: 'The prizes.',
    response: rowsOf('The prizes.'),
  },
  'GET /leaderboard-prizes/payouts': {
    tag: 'Leaderboard',
    description: 'Lists the 100 most recent prizes that were paid, newest first, with the player, their place and their XP in that period.',
    status: 200,
    responseDescription: 'The payouts.',
    response: rowsOf('The payouts.'),
  },
  'GET /segments': {
    tag: 'Segments',
    description: 'Lists the saved segments. Use a segment\'s key as `?segment=` on the leaderboard.',
    status: 200,
    responseDescription: 'The segments.',
    response: listOf('Segment', 'The segments.'),
  },
  'GET /segments/:segmentId/members': {
    tag: 'Segments',
    description: 'Counts the active people in a segment and shows up to ten, highest XP first. Takes the segment\'s ID or key.',
    status: 200,
    responseDescription: 'The count and a sample.',
    errors: [404],
    response: object({
      count: count('How many people match.', 412),
      sample: {
        type: 'array',
        description: 'Up to ten of them.',
        items: object({
          id: id('The user.', 'usr_1762421400000_a1b2c3d4'),
          externalId: text('Your ID for them.', 'user_123'),
          name: optionalText('Their name.', 'Ada'),
          totalXp: count('Their XP.', 750),
        }),
      },
    }),
  },
  'GET /leagues': {
    tag: 'Leagues',
    description: 'Lists the leagues, with how many are playing this season.',
    status: 200,
    responseDescription: 'The leagues.',
    response: listOf('League', 'The leagues.'),
  },
  'GET /users/:userId/leagues': {
    tag: 'Leagues',
    description: 'Gets the user\'s group in each league this season, with the table. Empty until they earn XP this season.',
    status: 200,
    responseDescription: 'One entry per league they are in.',
    errors: [404],
    response: listOf('UserLeague', 'The leagues.'),
  },
  'GET /users/:userId/friends': {
    tag: 'Social',
    description: 'Lists a user\'s friends, highest XP first.',
    status: 200,
    responseDescription: 'The friends.',
    errors: [404],
    response: listOf('Friend', 'The friends.'),
  },
  'POST /users/:userId/friends': {
    tag: 'Social',
    description: 'Makes two users friends, both ways. Doing it again changes nothing. A user can have up to 500 friends.',
    status: 201,
    responseDescription: 'They are friends.',
    errors: [400, 404, 409],
    response: object({ friends: flag('Always true.', true) }),
    body: {
      type: 'object',
      required: ['friendId'],
      properties: { friendId: { type: 'string', description: 'The other user: their ID or yours.', example: 'user_789' } },
    },
    example: { friendId: 'user_789' },
  },
  'DELETE /users/:userId/friends/:friendId': {
    tag: 'Social',
    description: 'Ends a friendship, both ways.',
    status: 200,
    responseDescription: 'Done. It is not an error if they were not friends.',
    errors: [404],
    response: object({ removed: flag('Always true.', true) }),
  },
  'POST /users/:userId/kudos': {
    tag: 'Social',
    description: 'Gives kudos from this user to another. One per pair per day, and at most 30 a day from one person; otherwise 409 or 429 with a `code`.',
    status: 201,
    responseDescription: 'The kudos.',
    errors: [400, 404, 409, 429],
    response: object({
      id: id('ID of the kudos.', 'kdo_5b1e'),
      projectId: id('The project.', 'prj_1762421400000_a1b2c'),
      fromUserId: id('Who gave it.', 'usr_1762421400000_a1b2c3d4'),
      toUserId: id('Who got it.', 'usr_1762421400000_e5f6a7b8'),
      message: optionalText('The message.', 'Great streak!'),
      createdAt: date('When.'),
    }),
    body: {
      type: 'object',
      required: ['to'],
      properties: {
        to: { type: 'string', description: 'The receiver: their ID or yours.', example: 'user_789' },
        message: { type: 'string', maxLength: 280, description: 'An optional message.', example: 'Great streak!' },
      },
    },
    example: { to: 'user_789', message: 'Great streak!' },
  },
  'GET /users/:userId/feed': {
    tag: 'Social',
    description: 'What the user and their friends did lately: achievements earned, kudos received and league promotions, newest first.',
    status: 200,
    responseDescription: 'The feed.',
    errors: [404],
    parameters: [limit(30)],
    response: listOf('FeedItem', 'The items.'),
  },
  'GET /users/:userId/referral': {
    tag: 'Social',
    description: 'Gets the user\'s invite code, made the first time it is asked for, and how their invites went.',
    status: 200,
    responseDescription: 'The code and counts.',
    errors: [404],
    response: object({
      code: text('Their invite code.', 'K7P2QX9M'),
      invited: count('People who used it.', 3),
      rewarded: count('Invites that were rewarded.', 2),
      pending: count('Invites waiting for the qualifying event.', 1),
    }),
  },
  'POST /users/:userId/referral': {
    tag: 'Social',
    description: 'Records that this user joined with someone\'s invite code. Works once per user, in their first 30 days. Fails with a `code` of `NO_PROGRAM`, `INVALID_CODE`, `SELF_REFERRAL`, `ALREADY_REFERRED` or `TOO_LATE`.',
    status: 201,
    responseDescription: 'The invite. `rewarded` straight away when the program needs no qualifying event.',
    errors: [400, 404, 409],
    response: object({
      id: id('ID of the invite.', 'ref_9a2c'),
      status: { type: 'string', enum: ['pending', 'rewarded', 'capped'], description: 'Where it stands.', example: 'pending' },
    }),
    body: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string', description: 'The invite code.', example: 'DOCSCODE' } },
    },
    example: { code: 'DOCSCODE' },
  },
  'GET /users/:userId/achievements': {
    tag: 'Achievements',
    description: 'Lists what a user has earned, newest first.',
    status: 200,
    responseDescription: 'The user\'s awards.',
    response: listOf('UserAchievement', 'The awards.'),
  },
  'GET /users/:userId/achievements/progress': {
    tag: 'Achievements',
    description: 'Shows how far a user is toward every achievement that measures itself, with tiers. Secret achievements are included and flagged `hidden`, so keep them out of anything players see. Use `/v1/me/achievements/progress` for a player-facing view.',
    status: 200,
    responseDescription: 'Progress for each achievement.',
    response: listOf('AchievementProgress', 'One entry per achievement with criteria.'),
    errors: [404],
  },
  'GET /users/:userId/achievements/:achievementId': {
    tag: 'Achievements',
    description: 'Gets one award. Returns 404 if the user hasn\'t earned it, so you can use this to check.',
    status: 200,
    responseDescription: 'The award.',
    response: ref('UserAchievement'),
    errors: [404],
  },
  'GET /users/:userId/challenges': {
    tag: 'Challenges',
    description: 'Lists every challenge in the project with this user\'s progress.',
    status: 200,
    responseDescription: 'The user\'s challenges.',
    errors: [404],
    response: object({
      userId,
      externalId: text('Your ID for this user.', 'user_123'),
      name: optionalText('Display name.', 'Ada Lovelace'),
      challenges: {
        type: 'array',
        description: 'Every challenge, including ones not started.',
        items: object({
          challengeId: id('The challenge\'s ID.', 'chl_1762421400000_p0o9i'),
          key: text('The challenge\'s key.', 'ten_orders'),
          name: text('Display name.', 'Ten orders'),
          description: optionalText('What users need to do.', 'Place ten orders'),
          iconUrl: optionalText('Link to an icon.', null),
          enabled: flag('Whether it is running.', true),
          trigger: text('The event type that counts.', 'order_completed'),
          target: count('How many events finish it.', 10),
          progress: count('Events counted so far.', 4),
          completed: flag('Whether the user finished.', false),
          completedAt: optionalDate('When the user finished.'),
          percent: count('Percent complete, from 0 to 100.', 40),
          type: { type: 'string', enum: ['counter', 'steps'], description: '`counter` counts events. `steps` needs each step in order.', example: 'counter' },
          recurrence: { ...nullable('string'), enum: ['daily', 'weekly', null], description: 'Starts over each UTC day or week, or null if it runs once.', example: null },
          periodEndsAt: optionalDate('When a repeating challenge starts over. Null for a one-off challenge.'),
          completions: count('Times the user has finished it, across all periods.', 1),
          steps: { ...nullable('array'), description: 'For a steps challenge, each step in order and whether it is done.', items: { type: 'object', properties: { name: { type: 'string' }, event: { type: 'string' }, done: { type: 'boolean' } } } },
        }),
      },
    }),
  },
  'GET /users/:userId/challenges/:challengeId': {
    tag: 'Challenges',
    description: 'Gets a user\'s progress on one challenge.',
    status: 200,
    responseDescription: 'The user\'s progress.',
    errors: [404],
    response: object({
      challengeId: id('The challenge\'s ID.', 'chl_1762421400000_p0o9i'),
      key: text('The challenge\'s key.', 'ten_orders'),
      name: text('Display name.', 'Ten orders'),
      description: optionalText('What users need to do.', 'Place ten orders'),
      target: count('How many events finish it.', 10),
      progress: count('Events counted so far.', 4),
      completed: flag('Whether the user finished.', false),
      completedAt: optionalDate('When the user finished.'),
      percent: count('Percent complete, from 0 to 100.', 40),
      type: { type: 'string', enum: ['counter', 'steps'], description: '`counter` counts events. `steps` needs each step in order.', example: 'counter' },
      recurrence: { ...nullable('string'), enum: ['daily', 'weekly', null], description: 'Starts over each UTC day or week, or null if it runs once.', example: null },
      periodEndsAt: optionalDate('When a repeating challenge starts over. Null for a one-off challenge.'),
      completions: count('Times the user has finished it, across all periods.', 1),
      steps: { ...nullable('array'), description: 'For a steps challenge, each step in order and whether it is done.', items: { type: 'object', properties: { name: { type: 'string' }, event: { type: 'string' }, done: { type: 'boolean' } } } },
      iconUrl: optionalText('Link to an icon.', null),
      enabled: flag('Whether it is running.', true),
      trigger: text('The event type that counts.', 'order_completed'),
    }),
  },
  'GET /xp/summary': {
    tag: 'XP',
    description: 'Gets XP totals for the whole project, and the top five users.',
    status: 200,
    responseDescription: 'The totals.',
    response: object({
      projectId,
      totalXpAwarded: count('XP currently held by all users.', 125000),
      totalTransactions: count('Number of XP changes.', 3400),
      totalUsersWithXp: count('Users with an XP balance.', 240),
      topUsers: {
        type: 'array',
        description: 'The five highest balances.',
        items: object({
          userId,
          externalId: text('Your ID for this user.', 'user_123'),
          totalXp: count('The user\'s total XP.', 1200),
        }),
      },
    }),
  },
  'GET /levels': {
    tag: 'Levels',
    description: 'Lists all levels in order, including disabled ones. The response is a plain array.',
    status: 200,
    responseDescription: 'The levels.',
    response: { type: 'array', items: ref('Level') },
  },
  'POST /levels': {
    tag: 'Levels',
    description: 'Adds a level. Higher levels must need more XP than lower ones.',
    status: 201,
    responseDescription: 'The new level.',
    response: ref('Level'),
    errors: [400, 409],
    body: { type: 'object', required: ['level', 'name', 'requiredXp'], properties: LEVEL_BODY_PROPERTIES },
    example: { level: 3, name: 'Veteran', requiredXp: 2000 },
  },
  'GET /levels/:levelId': {
    tag: 'Levels',
    description: 'Gets one level.',
    status: 200,
    responseDescription: 'The level.',
    response: ref('Level'),
    errors: [404],
  },
  'PATCH /levels/:levelId': {
    tag: 'Levels',
    description: 'Changes a level. Only the fields you send change, and the levels must still make sense together.',
    status: 200,
    responseDescription: 'The updated level.',
    response: ref('Level'),
    errors: [400, 404, 409],
    body: { type: 'object', properties: LEVEL_BODY_PROPERTIES },
    example: { name: 'Pathfinder' },
  },
  'GET /progression/summary': {
    tag: 'Levels',
    description: 'Shows how many users are on each enabled level.',
    status: 200,
    responseDescription: 'The distribution.',
    response: object({
      configuredLevelCount: count('Enabled levels.', 5),
      maxConfiguredLevel: count('Highest enabled level number.', 5),
      totalProjectXp: count('XP held by all users.', 125000),
      usersWithXp: count('Users with more than 0 XP.', 240),
      usersAtMaxLevel: count('Users on the top level.', 12),
      distribution: {
        type: 'array',
        description: 'One row per enabled level.',
        items: object({
          level: count('Level number.', 1),
          name: text('Level name.', 'Beginner'),
          userCount: count('Users on this level.', 80),
        }),
      },
    }),
  },
  'GET /leaderboard': {
    tag: 'Leaderboard',
    description: 'Gets the ranking for a period. Only users who earned XP in that period appear.',
    status: 200,
    responseDescription: 'One page of the ranking.',
    parameters: [
      PERIOD,
      PAGE,
      limit(20),
      query('search', 'Matches part of a name or external ID, ignoring case. Ranks stay the same.', { type: 'string' }),
      query('segment', 'Ranks only the people in this segment, by its key.', { type: 'string' }),
      query('friendsOf', 'Ranks only this user and their friends: their ID or yours.', { type: 'string' }),
      query('groupBy', 'Ranks groups instead of people, by a field such as `metadata.team`. The response then lists `group`, `xp` and `members`.', { type: 'string' }),
      query('score', 'With `groupBy`: `total` or `average` XP per group.', { type: 'string', enum: ['total', 'average'] }),
    ],
    response: object({
      period: { ...PERIOD_SCHEMA, description: 'The period used.', example: 'all_time' },
      page: count('Current page.', 1),
      limit: count('Results per page.', 20),
      total: count('Ranked users across all pages.', 240),
      entries: { type: 'array', description: 'The users on this page.', items: ref('LeaderboardEntry') },
    }),
  },
  'GET /leaderboard/:userId': {
    tag: 'Leaderboard',
    description: 'Gets one user\'s position. Returns 404 if they haven\'t earned XP in the period.',
    status: 200,
    responseDescription: 'The user\'s position.',
    parameters: [PERIOD],
    errors: [404],
    response: object({
      period: { ...PERIOD_SCHEMA, description: 'The period used.', example: 'all_time' },
      rank: { ...nullable('integer'), description: 'Position, starting at 1.', example: 4 },
      totalUsers: count('Ranked users in the period.', 240),
      entry: ref('LeaderboardEntry'),
    }),
  },
  'GET /streaks': {
    tag: 'Streaks',
    description: 'Lists the streaks defined in the project, newest first.',
    status: 200,
    responseDescription: 'The streaks.',
    response: listOf('StreakDefinition', 'The streaks.'),
  },
  'GET /users/:userId/streaks': {
    tag: 'Streaks',
    description: 'Gets a user\'s progress on each enabled streak, read as of now, so a streak that has ended shows 0 before the user\'s next action. Use `atRisk` to remind users before they lose it.',
    status: 200,
    responseDescription: 'The user\'s streaks.',
    response: listOf('UserStreak', 'One entry per enabled streak.'),
    errors: [404],
  },
  'GET /users/:userId/streaks/history': {
    tag: 'Streaks',
    description: 'Lists when a user\'s streaks started, grew, were saved by a freeze, or ended. Newest first. Extra activity in a period that already counted is not recorded.',
    status: 200,
    responseDescription: 'The history.',
    response: listOf('StreakChange', 'The changes.'),
    errors: [404],
    parameters: [
      query('streak', 'Only this streak, by key.', { type: 'string' }),
      limit(50),
    ],
  },
  'GET /achievements': {
    tag: 'Achievements',
    description: 'Lists all achievements in the project, newest first.',
    status: 200,
    responseDescription: 'The achievements.',
    response: listOf('Achievement', 'The achievements.'),
  },
  'GET /achievements/summary': {
    tag: 'Achievements',
    description: 'Gets achievement totals for the project, and the five most awarded.',
    status: 200,
    responseDescription: 'The totals.',
    response: summary({
      projectId,
      totalAchievements: count('All achievements.', 12),
      enabledAchievements: count('Achievements that can be awarded.', 10),
      totalAwards: count('Awards given.', 860),
      uniqueUsersWithAchievements: count('Users with at least one award.', 190),
      mostAwardedAchievements: {
        type: 'array',
        description: 'The five most awarded.',
        items: object({
          achievementId: id('The achievement\'s ID.', 'ach_1762421400000_q1w2e'),
          key: text('The achievement\'s key.', 'first_order'),
          name: text('Display name.', 'First order'),
          awardCount: count('Times awarded.', 150),
        }),
      },
    }),
  },
  'GET /achievements/:achievementId': {
    tag: 'Achievements',
    description: 'Gets one achievement.',
    status: 200,
    responseDescription: 'The achievement.',
    response: ref('Achievement'),
    errors: [404],
  },
  'GET /challenges': {
    tag: 'Challenges',
    description: 'Lists all challenges, oldest first. The response is a plain array.',
    status: 200,
    responseDescription: 'The challenges.',
    response: { type: 'array', items: ref('Challenge') },
  },
  'GET /challenges/summary': {
    tag: 'Challenges',
    description: 'Gets challenge totals for the project, and the five most completed.',
    status: 200,
    responseDescription: 'The totals.',
    response: summary({
      totalChallenges: count('All challenges.', 6),
      enabledChallenges: count('Challenges that are switched on.', 5),
      activeChallenges: count('Enabled challenges running right now.', 4),
      totalCompletedInstances: count('Times users finished a challenge.', 310),
      uniqueParticipatingUsers: count('Users with any progress.', 150),
      completionRate: count('Percent of started challenges that were finished.', 42),
      mostCompletedChallenges: {
        type: 'array',
        description: 'The five most completed.',
        items: object({
          id: id('The challenge\'s ID.', 'chl_1762421400000_p0o9i'),
          key: text('The challenge\'s key.', 'ten_orders'),
          name: text('Display name.', 'Ten orders'),
          completedCount: count('Times finished.', 90),
        }),
      },
    }),
  },
  'GET /challenges/:challengeId': {
    tag: 'Challenges',
    description: 'Gets one challenge.',
    status: 200,
    responseDescription: 'The challenge.',
    response: ref('Challenge'),
    errors: [404],
  },
};

const errorResponse = (status: number) => ({
  description: ERRORS[status],
  content: { 'application/json': { schema: ref('Error') } },
});

function jsonResponse(description: string, schema: Schema) {
  return { description, content: { 'application/json': { schema } } };
}

function jsonBody(schema: Schema, example: unknown, required = true) {
  return { required, content: { 'application/json': { schema, example } } };
}

function responses(status: number, description: string, schema: Schema, errors: number[]) {
  const failures = Object.fromEntries(errors.map((code) => [code, errorResponse(code)]));
  return { [status]: jsonResponse(description, schema), ...failures };
}

const operationId = (method: string, path: string) =>
  [method.toLowerCase(), ...path.split('/').filter(Boolean)]
    .map((part, index) => {
      const word = part.replace(/^:/, '').replace(/[{}]/g, '');
      const clean = word.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return index === 0 ? clean : clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .join('');

function publicOperation(route: (typeof PUBLIC_ROUTES)[number]) {
  const doc = DOCS[`${route.method} ${route.path}`];
  if (!doc) throw new Error(`No API docs for ${route.method} ${route.path}`);

  const pathParameters = [...route.path.matchAll(/:([A-Za-z]+)/g)].map((match) => {
    const name = match[1] as keyof typeof pathParams;
    return {
      in: 'path',
      name,
      required: true,
      description: pathParams[name],
      schema: { type: 'string' },
    };
  });
  const parameters = [...pathParameters, ...(doc.parameters ?? [])];

  return {
    operationId: operationId(route.method, route.path),
    tags: [doc.tag],
    summary: route.summary,
    description: doc.description,
    'x-required-scope': route.scope,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(doc.body ? { requestBody: jsonBody(doc.body, doc.example) } : {}),
    responses:
      doc.status === 204
        ? { 204: { description: doc.responseDescription }, ...Object.fromEntries([...(doc.errors ?? []), 401, 403, 429].map((code) => [code, errorResponse(code)])) }
        : responses(doc.status, doc.responseDescription, doc.response, [...(doc.errors ?? []), 401, 403, 429]),
  };
}

const ACCEPTED = {
  id: id('The event\'s ID.', 'evt_1762421400000_u7i8o'),
  status: { type: 'string', enum: ['accepted'], description: 'Always `accepted`.', example: 'accepted' },
  duplicate: flag('True if this idempotency key was already used, so nothing new happened.', false),
};

function meOperation(path: string, summaryText: string, description: string, response: Schema) {
  return {
    operationId: operationId('get', path),
    tags: ['Current user'],
    summary: summaryText,
    description,
    security: [{ endUserToken: [] }],
    responses: responses(200, summaryText, response, [401, 403, 404, 429]),
  };
}

/** A `/v1/me` request that changes something, which needs a token created with `access: "write"`. */
function meWrite(method: 'post' | 'delete', path: string, summaryText: string, description: string, options: { parameters?: unknown[]; body?: unknown; success: number; response?: Schema; errors: number[] }) {
  const failures = Object.fromEntries(options.errors.map((code) => [code, errorResponse(code)]));
  return {
    operationId: operationId(method, path),
    tags: ['Current user'],
    summary: summaryText,
    description: `${description} Needs a token created with \`access: "write"\`; a read-only token gets 403 \`TOKEN_READ_ONLY\`.`,
    security: [{ endUserToken: [] }],
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: options.body } : {}),
    responses: options.response ? responses(options.success, summaryText, options.response, options.errors) : { [options.success]: { description: summaryText }, ...failures },
  };
}

const codeParameter = { name: 'code', in: 'path', required: true, description: "The other player's invite code.", schema: { type: 'string' } };
const codeBody = (extra: Record<string, Schema> = {}, example: Record<string, unknown> = {}) =>
  jsonBody(
    { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 4, maxLength: 32, description: "The other player's invite code.", example: 'K7P2QX9M' }, ...extra } },
    { code: 'K7P2QX9M', ...example }
  );


/** Builds the spec from the public route table, so the two cannot disagree. */
export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {
    '/v1/events': {
      post: {
        operationId: 'postEvents',
        tags: ['Events'],
        summary: 'Send an event',
        description: 'Records something a user did. Rules run in the background, so the response only confirms the event was received. Add `?wait=true` to also get what it awarded, for showing it straight away.',
        'x-required-scope': 'events:write',
        parameters: [
          query('wait', 'Wait up to 5 seconds and include `rewards` in the response.', { type: 'boolean', default: false }),
          { ...IDEMPOTENCY_HEADER, description: 'Retrying with the same key can\'t record the event twice.' },
        ],
        requestBody: jsonBody(ref('EventInput'), {
          event: 'order_completed',
          user_id: 'user_123',
          payload: { amount: 149.99 },
          idempotency_key: 'order-4821',
        }),
        responses: responses(202, 'The event was received.', {
          type: 'object',
          required: ['id', 'status', 'duplicate'],
          properties: {
            ...ACCEPTED,
            rewards: { ...ref('EventRewards'), description: 'Only present with `?wait=true`.' },
          },
        }, [400, 401, 403, 409, 413, 429]),
      },
    },
    '/v1/events/batch': {
      post: {
        operationId: 'postEventsBatch',
        tags: ['Events'],
        summary: 'Send up to 100 events',
        description: 'Sends several events at once, up to 1 MB in total. Each one succeeds or fails alone, so check `results` and retry only the ones that failed.',
        'x-required-scope': 'events:write',
        requestBody: jsonBody(
          {
            type: 'object',
            required: ['events'],
            properties: {
              events: { type: 'array', minItems: 1, maxItems: 100, description: 'The events to send.', items: ref('EventInput') },
            },
          },
          { events: [{ event: 'lesson_completed', user_id: 'user_123' }, { event: 'quiz_passed', user_id: 'user_123', payload: { score: 90 } }] }
        ),
        responses: responses(207, 'A result for each event.', object({
          accepted: count('Events accepted.', 2),
          rejected: count('Events not accepted.', 0),
          results: {
            type: 'array',
            description: 'One result per event, in the order sent.',
            items: {
              type: 'object',
              required: ['index', 'status'],
              properties: {
                index: count('Position in the `events` array.', 0),
                status: { type: 'string', enum: ['accepted', 'rejected', 'failed'], description: 'What happened. Retry `failed` events.', example: 'accepted' },
                id: id('The event\'s ID, when accepted.', 'evt_1762421400000_u7i8o'),
                duplicate: flag('True if this idempotency key was already used.', false),
                code: text('Why it wasn\'t accepted.', 'USER_DEACTIVATED'),
              },
            },
          },
        }), [400, 401, 403, 429]),
      },
    },
    '/v1/end-user-tokens': {
      post: {
        operationId: 'postEndUserTokens',
        tags: ['Current user'],
        summary: 'Create a short-lived token for one user',
        description: 'Call this from your server, then give the token to your frontend, so your API key stays private. A token acts for that one user with the `/v1/me` endpoints. By default it only reads. Pass `access: "write"` to also let the user buy rewards, add friends, give kudos and register a device.',
        'x-required-scope': 'users:write',
        requestBody: jsonBody(
          {
            type: 'object',
            required: ['userId'],
            properties: {
              userId: { type: 'string', minLength: 1, maxLength: 128, description: 'Your own ID for the user, or their Gami.Fied ID.', example: 'user_123' },
              expiresInSeconds: { type: 'integer', minimum: 60, maximum: 3600, default: 900, description: 'How long the token lasts.', example: 900 },
              access: { type: 'string', enum: ['read', 'write'], default: 'read', description: 'What the token may do for its user. `write` is needed for every `/v1/me` request that is not a `GET`.', example: 'read' },
            },
          },
          { userId: 'user_123', expiresInSeconds: 900 }
        ),
        responses: responses(201, 'The token.', object({
          token: text('Send as `Authorization: Bearer <token>`.', 'geu_eyJwcm9qZWN0IjoicHJqXzhmM2syIn0.c2lnbmF0dXJl'),
          expiresAt: date('When the token stops working.'),
          access: { type: 'string', enum: ['read', 'write'], description: 'What the token may do.', example: 'read' },
        }), [400, 401, 403, 404, 429]),
      },
    },
    '/v1/me': {
      get: meOperation('/v1/me', 'Get the current user', 'Gets the token holder\'s name, XP and level. Safe to call from a browser.', object({
        externalId: text('Your ID for this user.', 'user_123'),
        name: optionalText('Display name.', 'Ada Lovelace'),
        totalXp: count('Total XP.', 750),
        level: { ...nullable('object'), description: 'Current level. Null if the project has no levels.', required: ['number', 'name'], properties: { number: count('Level number.', 2), name: text('Level name.', 'Explorer') } },
        xpToNextLevel: { ...nullable('integer'), description: 'XP still needed. Null at the top level.', example: 250 },
        progressPercent: { ...nullable('integer'), description: 'Percent of the way to the next level.', example: 50 },
        cosmetics: object({
          title: { ...nullable('object'), description: 'The title the player wears.', required: ['key', 'name'], properties: { key: text('Its key.', 'night_owl'), name: text('Its name.', 'Night owl') } },
          frame: { ...nullable('object'), description: 'The avatar frame the player wears.', required: ['key', 'name', 'imageUrl'], properties: { key: text('Its key.', 'gold_ring'), name: text('Its name.', 'Gold ring'), imageUrl: optionalText('Link to its picture.', null) } },
          items: { type: 'array', description: 'Profile items the player wears.', items: object({ key: text('Its key.', 'trophy'), name: text('Its name.', 'Trophy'), imageUrl: optionalText('Link to its picture.', null) }) },
        }),
      })),
    },
    '/v1/me/devices': {
      post: {
        operationId: 'postMeDevices',
        tags: ['Current user'],
        summary: "Register the current user's phone for push notifications",
        description: "Needs a token created with `access: \"write\"`. Call this from your mobile app with the token the phone's push service gave it, each time the app starts. A token belongs to one player, so if the phone is later used by someone else it moves to them. Needs a push integration (Apple or Firebase) set up in the dashboard.'",
        security: [{ endUserToken: [] }],
        requestBody: jsonBody(
          {
            type: 'object',
            required: ['token', 'platform'],
            properties: {
              token: { type: 'string', minLength: 16, maxLength: 4096, description: 'The APNs device token, or the FCM registration token.', example: 'fMyDeviceTokenFromFirebase1234567890' },
              platform: { type: 'string', enum: ['ios', 'android'], description: 'Which push service the token is for.', example: 'android' },
            },
          },
          { token: 'fMyDeviceTokenFromFirebase1234567890', platform: 'android' }
        ),
        responses: responses(201, 'The phone is registered.', object({ registered: flag('Always true.', true) }), [400, 401, 403, 429]),
      },
    },
    '/v1/me/devices/{token}': {
      delete: {
        operationId: 'deleteMeDevicesToken',
        tags: ['Current user'],
        summary: "Remove the current user's phone",
        description: "Needs a token created with `access: \"write\"`. Call this when the player signs out, so they stop getting notifications on that phone. Only removes a phone registered to the token holder.'",
        security: [{ endUserToken: [] }],
        parameters: [{ name: 'token', in: 'path', required: true, description: 'The device token, URL-encoded.', schema: { type: 'string' } }],
        responses: responses(200, 'The phone is removed, or was not registered.', object({ removed: flag('Always true.', true) }), [401]),
      },
    },
    '/v1/me/wallets': {
      get: meOperation('/v1/me/wallets', "List the current user's point balances", 'Shows what the token holder can spend in each currency.', meItems({
        currency: text('Key of the currency.', 'coins'),
        name: text('Display name.', 'Coins'),
        symbol: optionalText('A short symbol.', '🪙'),
        balance: count('What they can spend now.', 1200),
      })),
    },
    '/v1/me/rewards': {
      get: meOperation('/v1/me/rewards', 'List the store for the current user', 'Lists rewards that can be bought, cheapest first, with whether this player can afford each and whether it is in stock, so a store screen needs one call.', meItems({
        key: text('The reward\'s key.', 'free_coffee'),
        name: text('Display name.', 'Free coffee'),
        description: optionalText('What it is.', null),
        imageUrl: optionalText('Link to a picture.', null),
        currency: text('Key of the currency it costs.', 'coins'),
        currencyName: text('Name of the currency.', 'Coins'),
        currencySymbol: optionalText('Its symbol.', null),
        cost: count('The price.', 500),
        inStock: flag('Whether any are left.', true),
        affordable: flag('Whether this player has enough.', true),
      })),
    },
    '/v1/me/rewards/{rewardKey}/redeem': {
      post: {
        operationId: 'postMeRewardsRewardKeyRedeem',
        tags: ['Current user'],
        summary: 'Buy a reward as the current user',
        description: 'Spends the token holder\'s points on a reward. Needs a token created with `access: "write"`; a read-only token gets 403 `TOKEN_READ_ONLY`. Returns 409 with a `code` of `INSUFFICIENT_POINTS`, `OUT_OF_STOCK`, `OUT_OF_CODES` or `LIMIT_REACHED` when it cannot be bought. Send `idempotencyKey` so a retry does not buy twice.',
        security: [{ endUserToken: [] }],
        parameters: [{ name: 'rewardKey', in: 'path', required: true, description: 'The reward\'s key.', schema: { type: 'string' } }],
        requestBody: jsonBody({ type: 'object', properties: { idempotencyKey: { type: 'string', maxLength: 128, description: 'Makes a retry safe.', example: 'buy-1' } } }, { idempotencyKey: 'buy-1' }, false),
        responses: responses(201, 'The purchase.', object({
          id: id('ID of the purchase.', 'rdm_1762421400000_a1b2c3d4'),
          reward: text('The reward name.', 'Free coffee'),
          cost: count('What it cost.', 500),
          status: { type: 'string', enum: ['pending', 'fulfilled', 'cancelled'], description: 'Where it stands.', example: 'fulfilled' },
          code: optionalText('The code handed out, if the reward uses codes.', 'COFFEE-7H2K'),
          duplicate: flag('True if this key was used before.', false),
        }), [401, 404, 409]),
      },
    },
    '/v1/me/redemptions': {
      get: meOperation('/v1/me/redemptions', "List the current user's purchases", 'Lists the token holder\'s 50 most recent purchases, with any code they were given.', meItems({
        id: id('ID of the purchase.', 'rdm_1762421400000_a1b2c3d4'),
        reward: text('The reward name.', 'Free coffee'),
        cost: count('What it cost.', 500),
        status: { type: 'string', enum: ['pending', 'fulfilled', 'cancelled'], description: 'Where it stands.', example: 'fulfilled' },
        code: optionalText('The code, if any.', 'COFFEE-7H2K'),
        createdAt: date('When it was bought.'),
      })),
    },
    '/v1/me/leagues': {
      get: meOperation('/v1/me/leagues', "Get the current user's leagues", 'The token holder\'s group in each league this season, with the table. Rows say who is moving up or down, and which is the player.', meItems({
        league: object({ key: text('The league\'s key.', 'weekly'), name: text('Its name.', 'Weekly league') }),
        tier: count('0 is the lowest tier.', 1),
        tierName: text('The tier.', 'Silver'),
        groupNo: count('The group.', 2),
        seasonEndsAt: date('When the season ends.'),
        standings: { type: 'array', description: 'The table.', items: object({ rank: count('Place.', 1), name: optionalText('Name.', 'Ada'), avatarUrl: optionalText('Picture.', null), xp: count('XP this season.', 840), zone: { type: 'string', enum: ['promotion', 'relegation', 'safe'], description: 'Moving up, down, or staying.', example: 'safe' }, isMe: flag('The player.', false) }) },
      })),
    },
    '/v1/me/friends': {
      post: meWrite('post', '/v1/me/friends', 'Ask a player to be friends', 'Sends a friend request to the player with this code. They become friends when that player accepts, or at once if they had already asked.', {
        body: codeBody(),
        success: 201,
        response: object({
          friends: flag('True when the two are friends now.', false),
          status: { type: 'string', enum: ['friends', 'requested'], description: 'Whether they are friends, or the request is waiting.', example: 'requested' },
        }),
        errors: [400, 401, 403, 404, 429],
      }),
      get: meOperation('/v1/me/friends', "List the current user's friends", 'Friends are found by invite code, so no IDs are shown.', meItems({
        name: optionalText('Name.', 'Grace'),
        avatarUrl: optionalText('Picture.', null),
        totalXp: count('All-time XP.', 1300),
        code: optionalText('Their invite code, used to remove them or give kudos.', 'K7P2QX9M'),
      })),
    },
    '/v1/me/friends/requests': {
      get: meOperation('/v1/me/friends/requests', 'List friend requests waiting for the current user', 'A player becomes a friend only after they accept. Answer a request with the sender\'s code.', meItems({
        name: optionalText('Who asked.', 'Grace'),
        avatarUrl: optionalText('Picture.', null),
        code: text('Their invite code, used to accept or decline.', 'K7P2QX9M'),
        requestedAt: date('When they asked.'),
      })),
    },
    '/v1/me/friends/{code}': {
      delete: meWrite('delete', '/v1/me/friends/{code}', 'End a friendship', 'Removes the player with this code from the current user\'s friends, both ways.', {
        parameters: [codeParameter],
        success: 204,
        errors: [401, 403],
      }),
    },
    '/v1/me/friends/requests/{code}/accept': {
      post: meWrite('post', '/v1/me/friends/requests/{code}/accept', 'Accept a friend request', 'Accepts the request sent by the player with this code.', {
        parameters: [codeParameter],
        success: 201,
        response: object({ friends: flag('Always true.', true) }),
        errors: [401, 403, 404],
      }),
    },
    '/v1/me/friends/requests/{code}': {
      delete: meWrite('delete', '/v1/me/friends/requests/{code}', 'Decline or take back a friend request', 'Declines a request from the player with this code, or takes back one sent to them.', {
        parameters: [codeParameter],
        success: 204,
        errors: [401, 403],
      }),
    },
    '/v1/me/feed': {
      get: meOperation('/v1/me/feed', 'Get the current user\'s friends feed', 'What the player and their friends did lately.', meItems({
        type: { type: 'string', enum: ['achievement', 'kudos', 'promotion'], description: 'What happened.', example: 'kudos' },
        at: date('When.'),
        name: optionalText('Who.', 'Grace'),
        title: text('A line to show.', 'Got kudos from Ada'),
        detail: optionalText('More detail.', 'Great streak!'),
        isMe: flag('It was the player.', false),
      })),
    },
    '/v1/me/kudos': {
      post: meWrite('post', '/v1/me/kudos', 'Give kudos to a player', 'A small thank-you to the player with this code. One per person per day, and at most 30 a day.', {
        body: codeBody({ message: { type: 'string', maxLength: 280, description: 'An optional message.', example: 'Great streak!' } }, { message: 'Great streak!' }),
        success: 201,
        response: object({ id: id('ID of the kudos.', 'kdo_5f0c1e7a'), createdAt: date('When it was given.') }),
        errors: [400, 401, 403, 404, 409, 429],
      }),
      get: meOperation('/v1/me/kudos', 'List kudos the current user received', 'The 50 most recent.', meItems({
        from: optionalText('Who gave it.', 'Ada'),
        message: optionalText('The message.', 'Great streak!'),
        createdAt: date('When.'),
      })),
    },
    '/v1/me/referral': {
      post: meWrite('post', '/v1/me/referral', 'Use an invite code', 'Records that the current user joined with this code. Works once, in their first 30 days.', {
        body: codeBody(),
        success: 201,
        response: object({ status: { type: 'string', enum: ['pending', 'rewarded', 'capped'], description: 'Whether the invite has been rewarded yet.', example: 'pending' } }),
        errors: [400, 401, 403, 404, 409],
      }),
      get: meOperation('/v1/me/referral', "Get the current user's invite code", 'The player\'s invite code and how their invites went.', object({
        code: text('The code.', 'K7P2QX9M'),
        invited: count('People who used it.', 3),
        rewarded: count('Rewarded invites.', 2),
        pending: count('Waiting invites.', 1),
      })),
    },
    '/v1/me/stream': {
      get: {
        operationId: 'getMeStream',
        tags: ['Current user'],
        summary: "Stream the current user's updates",
        description: "Opens a server-sent events stream that pushes this player's new notifications and XP balance as they happen, for instant toasts. Events: `ready`, `notification` (with an `id` to send back as `Last-Event-ID` after a reconnect, so nothing is missed), `xp` (`{ totalXp }`). A comment line is sent every 25 seconds to keep the connection open. A browser's `EventSource` cannot send headers, so the token may be passed as `?access_token=`. Each player can hold up to 5 streams.",
        security: [{ endUserToken: [] }],
        responses: {
          '200': {
            description: 'A stream of events.',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          '401': { description: 'The token is missing or has expired.' },
          '429': { description: 'This player already has the most streams allowed open.' },
        },
      },
    },
    '/v1/me/achievements': {
      get: meOperation('/v1/me/achievements', "List the current user's achievements", 'Lists what the token holder has earned, newest first.', meItems({
        key: text('The achievement\'s key.', 'first_order'),
        name: text('Display name.', 'First order'),
        description: optionalText('How to earn it.', 'Place your first order'),
        iconUrl: optionalText('Link to a badge image.', null),
        awardedAt: date('When it was awarded.'),
      })),
    },
    '/v1/me/achievements/{achievementKey}/share': {
      get: {
        ...meOperation('/v1/me/achievements/{achievementKey}/share', 'Get a share image link for an achievement', 'A link to a 1200 by 630 image of an achievement the current user earned, for social media. The link is signed and public.', object({
          url: text('The address of the image.', 'https://api.example.com/v1/share/ua_5f0c1e7a.Zm9vYmFyYmF6cXV4MTIzNA.svg'),
        })),
        parameters: [{ name: 'achievementKey', in: 'path', required: true, description: 'The achievement\'s key.', schema: { type: 'string' } }],
      },
    },
    '/v1/me/achievements/progress': {
      get: meOperation('/v1/me/achievements/progress', "Show the current user's achievement progress", 'Shows how far the token holder is toward each achievement that measures itself. Secret achievements are left out until they are earned.', meItems({
        key: text('The achievement\'s key.', 'bookworm'),
        name: text('Display name.', 'Bookworm'),
        description: optionalText('How to earn it.', 'Finish lessons'),
        iconUrl: optionalText('Link to a badge image.', null),
        earned: flag('Whether the first tier is reached.', true),
        tier: count('Highest tier reached. 0 means none yet.', 2),
        tierCount: count('How many tiers there are.', 3),
        tierName: optionalText('Name of the tier reached, from the second tier up.', 'Silver'),
        value: count('What the user has so far.', 63),
        nextTarget: { ...nullable('number'), description: 'The next number to reach. Null once every tier is done.', example: 100 },
        fraction: { type: 'number', description: 'How far toward the next target, from 0 to 1.', example: 0.63 },
        complete: flag('Whether every tier is done.', false),
      })),
    },
    '/v1/me/streaks': {
      get: meOperation('/v1/me/streaks', "List the current user's streaks", 'Shows the token holder\'s progress on each streak, as of now. A streak that has ended reads 0, and `atRisk` is true while they have not yet been active this period.', meItems({
        key: text('The streak\'s key.', 'daily_lesson'),
        name: text('Display name.', 'Daily lesson'),
        cadence: { type: 'string', enum: ['daily', 'weekly'], description: 'How often they need to be active.', example: 'daily' },
        current: count('Days or weeks in a row right now.', 12),
        longest: count('Their best.', 30),
        freezes: count('Freezes they hold.', 1),
        atRisk: flag('True when they have not yet been active this period.', false),
        timeZone: text('The zone their days are counted in.', 'Europe/London'),
        lastActivityAt: optionalDate('When they last counted toward it.'),
      })),
    },
    '/v1/me/leaderboard': {
      get: {
        ...meOperation('/v1/me/leaderboard', 'Show a leaderboard to the current user', 'Returns the top players for a period and the token holder\'s own place, with names and XP only, so it is safe to show in a browser. Use `period` (`all_time`, `daily`, `weekly`, `monthly`) and `limit` (up to 50).', object({
          period: { type: 'string', enum: ['all_time', 'daily', 'weekly', 'monthly'], description: 'The period used.', example: 'weekly' },
          total: count('Ranked players.', 240),
          entries: { type: 'array', description: 'The top players.', items: object({
            rank: count('Place, starting at 1.', 1),
            name: optionalText('Display name.', 'Ada Lovelace'),
            avatarUrl: optionalText('Link to a profile picture.', null),
            xp: count('XP for the period.', 1200),
            levelName: optionalText('Level name, if the project has levels.', 'Gold'),
            title: optionalText('The title the player wears, if any.', null),
            frameUrl: optionalText('Picture of the avatar frame the player wears, if any.', null),
            isMe: flag('Whether this is the token holder.', false),
          }) },
          me: { ...nullable('object'), description: 'The token holder\'s own entry. Null if they have no XP in the period.', additionalProperties: true },
        })),
        parameters: [
          { name: 'period', in: 'query', required: false, description: 'all_time, daily, weekly or monthly.', schema: { type: 'string', default: 'all_time' } },
          { name: 'limit', in: 'query', required: false, description: 'How many players, up to 50.', schema: { type: 'integer', default: 10 } },
        ],
      },
    },
    '/v1/me/challenges': {
      get: meOperation('/v1/me/challenges', "List the current user's challenges", 'Lists the challenges open right now, started or not, with the token holder\'s progress. Daily and weekly challenges show the current period.', meItems({
        key: text('The challenge\'s key.', 'ten_orders'),
        name: text('Display name.', 'Ten orders'),
        description: optionalText('What to do.', 'Place ten orders'),
        iconUrl: optionalText('Link to an image.', null),
        type: { type: 'string', enum: ['counter', 'steps'], description: '`counter` counts events. `steps` needs each step in order.', example: 'counter' },
        recurrence: { ...nullable('string'), enum: ['daily', 'weekly', null], description: 'Starts over each day or week, or null if it runs once.', example: null },
        target: count('How many events, or steps, finish it.', 10),
        progress: count('Counted so far.', 4),
        completed: flag('Whether the user finished it this period.', false),
        locked: flag('True for a step of a journey whose earlier steps are not finished. Events do not count yet.', false),
        periodEndsAt: optionalDate('When a repeating challenge starts over, or when a one-off one ends.'),
        steps: { ...nullable('array'), description: 'For a steps challenge, each step and whether it is done.', items: { type: 'object', properties: { name: { type: 'string' }, done: { type: 'boolean' } } } },
      })),
    },
    '/v1/me/notifications': {
      get: meOperation('/v1/me/notifications', "List the current user's notifications", 'Lists the token holder\'s 50 most recent notifications, newest first.', meItems({
        id: id('The notification\'s ID.', 'ntf_1762421400000_h6g5f'),
        type: text('What kind of notification it is.', 'achievement_unlocked'),
        title: text('Short heading.', 'Achievement unlocked'),
        message: text('Full text.', 'You earned First order'),
        createdAt: date('When it was sent.'),
      })),
    },
    '/v1/me/boxes': {
      get: meOperation('/v1/me/boxes', 'List the boxes the current user can open', 'Lists the mystery boxes and wheels, each with its drop table (every item and its chance), what a try costs, how many tries are left today, and how far the player is from the guarantee. Show the drop table to players: published odds are what makes random rewards fair.', meItems(PLAYER_BOX)),
    },
    '/v1/me/boxes/{boxKey}/open': {
      post: meWrite('post', '/v1/me/boxes/{boxKey}/open', 'Open a box as the current user', 'One try gives one item, picked by weight. The cost, the draw and the prizes happen together. Returns 409 with a `code` of `INSUFFICIENT_POINTS` or `LIMIT_REACHED` when it cannot be opened. Send `idempotencyKey` so a retry does not open twice.', {
        parameters: [{ name: 'boxKey', in: 'path', required: true, description: "The box's key.", schema: { type: 'string' } }],
        body: jsonBody({ type: 'object', properties: { idempotencyKey: { type: 'string', maxLength: 128, description: 'Makes a retry safe.', example: 'open-1' } } }, { idempotencyKey: 'open-1' }, false),
        success: 201,
        response: BOX_OPEN,
        errors: [401, 403, 404, 409],
      }),
    },
    '/v1/me/passes': {
      get: meOperation('/v1/me/passes', "List the current user's season passes", 'Lists each pass that is running or can still be claimed from, with the XP earned this season, each tier, and what is ready to claim.', meItems(PLAYER_PASS)),
    },
    '/v1/me/passes/{passKey}/claim': {
      post: meWrite('post', '/v1/me/passes/{passKey}/claim', 'Claim season pass rewards', 'Send a `tier` and a `lane` for one reward, or neither to claim everything that is ready. Returns 409 with a `code` of `TIER_LOCKED`, `PREMIUM_REQUIRED`, `ALREADY_CLAIMED`, `PASS_NOT_STARTED` or `PASS_ENDED`.', {
        parameters: [{ name: 'passKey', in: 'path', required: true, description: "The pass's key.", schema: { type: 'string' } }],
        body: jsonBody(PASS_CLAIM_BODY, {}, false),
        success: 200,
        response: PASS_CLAIM,
        errors: [401, 403, 404, 409],
      }),
    },
    '/v1/me/passes/{passKey}/premium': {
      post: meWrite('post', '/v1/me/passes/{passKey}/premium', 'Buy the premium lane of a pass', 'Spends the player\'s points on the premium lane while the season is running. Its rewards for tiers already reached can then be claimed. Returns 409 with a `code` of `INSUFFICIENT_POINTS`, `NO_PREMIUM_LANE` or `PASS_NOT_ACTIVE`.', {
        parameters: [{ name: 'passKey', in: 'path', required: true, description: "The pass's key.", schema: { type: 'string' } }],
        success: 201,
        response: object({ pass: text('The pass\'s key.', 'season_1'), premium: flag('Always true.', true), duplicate: flag('True if the player already held it, so nothing was charged.', false), cost: count('What was charged.', 500) }),
        errors: [401, 403, 404, 409],
      }),
    },
    '/v1/me/team': {
      get: meOperation('/v1/me/team', "Get the current user's team", 'Gets the player\'s team with its place among the teams and up to 50 members. `team` is null when they are in none.', object({ team: PLAYER_TEAM })),
      post: meWrite('post', '/v1/me/team', 'Join a team', 'Joins a team, leaving any other. Returns 409 `TEAM_FULL` when the team is at its size limit. If you place players in teams yourself, give them read-only tokens and this cannot be used.', {
        body: jsonBody(TEAM_BODY, { team: 'red' }),
        success: 200,
        response: TEAM_JOIN,
        errors: [400, 401, 403, 404, 409],
      }),
      delete: meWrite('delete', '/v1/me/team', 'Leave the team', 'Takes the player out of their team. It is not an error if they were in none.', { success: 204, errors: [401, 403] }),
    },
    '/v1/me/teams': {
      get: meOperation('/v1/me/teams', 'List the teams', 'Lists every team with its size and XP, highest first. It is both the list to join from and the team board.', meItems({
        key: text('The team\'s key.', 'red'),
        name: text('Display name.', 'Red team'),
        imageUrl: optionalText('Link to a picture.', null),
        members: count('How many players are in it.', 12),
        maxMembers: { ...nullable('integer'), description: 'Most members, or null for no limit.', example: null },
        full: flag('Whether it is at its size limit.', false),
        xp: count('XP held by its members together.', 8400),
        rank: count('Its place by XP.', 1),
        isMine: flag('Whether the player is in it.', false),
      })),
    },
    '/v1/me/goals': {
      get: meOperation('/v1/me/goals', 'List shared goals for the current user', 'Lists the shared goals with the total so far (everyone\'s, or the player\'s team\'s for a team goal) and how much the player added. A finished or expired goal stays on the list for a week. A team goal also carries `team`, which is null when the player is in no team.', {
        type: 'object',
        required: ['data'],
        properties: { data: { type: 'array', description: 'The goals.', items: { type: 'object', required: Object.keys(PLAYER_GOAL), properties: { ...PLAYER_GOAL, team: { ...nullable('object'), description: 'For a team goal, the player\'s team.', additionalProperties: true } } } } },
      }),
    },
    '/v1/me/cosmetics': {
      get: meOperation('/v1/me/cosmetics', 'List cosmetics for the current user', 'Lists every title, frame and profile item: which the player owns and wears, and how to get the rest.', meItems(PLAYER_COSMETIC)),
    },
    '/v1/me/cosmetics/{cosmeticKey}/buy': {
      post: meWrite('post', '/v1/me/cosmetics/{cosmeticKey}/buy', 'Buy a cosmetic', 'Spends the player\'s points on a cosmetic. Returns 409 with a `code` of `INSUFFICIENT_POINTS`, `ALREADY_OWNED` or `NOT_FOR_SALE`.', {
        parameters: [{ name: 'cosmeticKey', in: 'path', required: true, description: "The cosmetic's key.", schema: { type: 'string' } }],
        success: 201,
        response: object({ key: text('The cosmetic\'s key.', 'night_owl'), name: text('Display name.', 'Night owl'), kind: text('Its kind.', 'title'), cost: count('What it cost.', 200), currency: text('Key of the currency.', 'gems') }),
        errors: [401, 403, 404, 409],
      }),
    },
    '/v1/me/cosmetics/{cosmeticKey}/equip': {
      post: meWrite('post', '/v1/me/cosmetics/{cosmeticKey}/equip', 'Wear a cosmetic', 'Puts on a cosmetic the player owns. A new title or frame replaces the one worn. Returns 403 `NOT_OWNED` otherwise.', {
        parameters: [{ name: 'cosmeticKey', in: 'path', required: true, description: "The cosmetic's key.", schema: { type: 'string' } }],
        success: 200,
        response: EQUIP,
        errors: [401, 403, 404],
      }),
      delete: meWrite('delete', '/v1/me/cosmetics/{cosmeticKey}/equip', 'Take a cosmetic off', 'Takes off a cosmetic the player is wearing.', {
        parameters: [{ name: 'cosmeticKey', in: 'path', required: true, description: "The cosmetic's key.", schema: { type: 'string' } }],
        success: 200,
        response: EQUIP,
        errors: [401, 403, 404],
      }),
    },
    '/v1/me/leaderboard/prizes': {
      get: meOperation('/v1/me/leaderboard/prizes', 'List leaderboard prizes for the current user', 'Lists the prizes for places on the daily, weekly and monthly boards, and the last 20 the player won. Prizes are paid shortly after a period ends, in UTC.', object({
        prizes: {
          type: 'array',
          description: 'What is on offer.',
          items: object({ name: text('Display name.', 'Weekly top 3'), period: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Which board.', example: 'weekly' }, fromRank: count('First place it covers.', 1), toRank: count('Last place it covers.', 3), rewards: prizeList('What each of those places gets.') }),
        },
        won: {
          type: 'array',
          description: 'What the player won, newest first.',
          items: object({ period: text('Which board.', 'weekly'), periodStart: text('First day of the period, in UTC.', '2026-11-02'), rank: count('Their place.', 2), xp: count('Their XP in that period.', 1840), rewards: prizeList('What they got.'), paidAt: date('When it was paid.') }),
        },
      })),
    },
    '/v1/me/journeys': {
      get: meOperation('/v1/me/journeys', "List the current user's journeys", 'Lists the journeys with the player\'s progress on each step. A step is `locked` until every step before it is finished.', meItems(PLAYER_JOURNEY)),
    },
    '/v1/me/rank': {
      get: meOperation('/v1/me/rank', "Get the current user's rank", 'Gets the token holder\'s all-time position. `rank` is null until they earn XP.', object({
        rank: { ...nullable('integer'), description: 'Position, starting at 1.', example: 4 },
        totalUsers: count('Ranked users.', 240),
      })),
    },
  };

  for (const route of PUBLIC_ROUTES) {
    const path = `/v1${route.path.replace(/:([A-Za-z]+)/g, '{$1}')}`;
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = publicOperation(route);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Gami.Fied API',
      version: '1.2.0',
      description: 'The stable public API. The API key identifies the project, so paths never include a project ID.',
    },
    tags: ['Events', 'Users', 'XP', 'Levels', 'Achievements', 'Streaks', 'Store', 'Challenges', 'Leaderboard', 'Segments', 'Leagues', 'Social', 'Current user'].map(
      (name) => ({ name })
    ),
    security: [{ apiKey: [] }],
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'A project API key, starting `gami_live_`, or `gami_test_` for a staging or development project. Keep it on your server.',
        },
        endUserToken: {
          type: 'http',
          scheme: 'bearer',
          description: 'A short-lived token from `POST /v1/end-user-tokens`. Safe to use in a browser.',
        },
      },
      schemas: SCHEMAS,
    },
  };
}
