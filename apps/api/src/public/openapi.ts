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
  Achievement: object({
    id: id('Gami.Fied\'s ID for the achievement.', 'ach_1762421400000_q1w2e'),
    projectId,
    key: text('Short name that rules use to award it. Unique in the project.', 'first_order'),
    name: text('Display name.', 'First order'),
    description: optionalText('How to earn it.', 'Place your first order'),
    iconUrl: optionalText('Link to a badge image.', null),
    enabled: flag('Whether it can still be awarded.', true),
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
    type: { type: 'string', enum: ['counter'], description: 'How progress is measured.', example: 'counter' },
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
};

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
  'GET /users/:userId/achievements': {
    tag: 'Achievements',
    description: 'Lists what a user has earned, newest first.',
    status: 200,
    responseDescription: 'The user\'s awards.',
    response: listOf('UserAchievement', 'The awards.'),
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
    responses: responses(doc.status, doc.responseDescription, doc.response, [
      ...(doc.errors ?? []),
      401,
      403,
      429,
    ]),
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

const meItems = (properties: Record<string, Schema>) =>
  object({ data: { type: 'array', description: 'The results.', items: object(properties) } });

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
        description: 'Call this from your server, then give the token to your frontend. It can only read that one user\'s data with the `/v1/me` endpoints, so your API key stays private.',
        'x-required-scope': 'users:write',
        requestBody: jsonBody(
          {
            type: 'object',
            required: ['userId'],
            properties: {
              userId: { type: 'string', minLength: 1, maxLength: 128, description: 'Your own ID for the user, or their Gami.Fied ID.', example: 'user_123' },
              expiresInSeconds: { type: 'integer', minimum: 60, maximum: 3600, default: 900, description: 'How long the token lasts.', example: 900 },
            },
          },
          { userId: 'user_123', expiresInSeconds: 900 }
        ),
        responses: responses(201, 'The token.', object({
          token: text('Send as `Authorization: Bearer <token>`.', 'geu_eyJwcm9qZWN0IjoicHJqXzhmM2syIn0.c2lnbmF0dXJl'),
          expiresAt: date('When the token stops working.'),
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
      })),
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
    '/v1/me/challenges': {
      get: meOperation('/v1/me/challenges', "List the current user's challenges", 'Lists challenges the token holder has started.', meItems({
        key: text('The challenge\'s key.', 'ten_orders'),
        name: text('Display name.', 'Ten orders'),
        target: count('How many events finish it.', 10),
        progress: count('Events counted so far.', 4),
        completed: flag('Whether the user finished.', false),
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
      version: '1.0.0',
      description: 'The stable public API. The API key identifies the project, so paths never include a project ID.',
    },
    tags: ['Events', 'Users', 'XP', 'Levels', 'Achievements', 'Challenges', 'Leaderboard', 'Current user'].map(
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
          description: 'A project API key, starting `gami_live_`. Keep it on your server.',
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
