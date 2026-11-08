export interface PublicRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path after `/v1`. It mirrors the path after `/api/projects/:projectId`. */
  path: string;
  scope: string;
  summary: string;
}

const get = (path: string, scope: string, summary: string): PublicRoute => ({
  method: 'GET',
  path,
  scope,
  summary,
});

/**
 * The stable public API. The key identifies the project, so paths carry no project ID, and
 * anything not listed here is internal and can change without notice.
 */
export const PUBLIC_ROUTES: PublicRoute[] = [
  get('/users', 'users:read', 'List users'),
  { method: 'POST', path: '/users', scope: 'users:write', summary: 'Create a user' },
  get('/users/by-external-id/:externalId', 'users:read', 'Get a user by external ID'),
  get('/users/:userId', 'users:read', 'Get a user'),
  { method: 'PATCH', path: '/users/:userId', scope: 'users:write', summary: 'Update a user' },
  { method: 'DELETE', path: '/users/:userId', scope: 'users:write', summary: 'Deactivate a user' },
  {
    method: 'POST',
    path: '/users/:userId/erase',
    scope: 'users:write',
    summary: 'Permanently erase a user',
  },
  get('/users/:userId/progress', 'levels:read', "Get a user's level progress"),
  get('/users/:userId/xp', 'xp:read', "Get a user's XP balance"),
  get('/users/:userId/xp/ledger', 'xp:read', "List a user's XP history"),
  {
    method: 'POST',
    path: '/users/:userId/xp/adjust',
    scope: 'xp:write',
    summary: "Adjust a user's XP",
  },
  get('/users/:userId/achievements', 'achievements:read', "List a user's achievements"),
  get(
    '/users/:userId/achievements/:achievementId',
    'achievements:read',
    "Get one of a user's achievements"
  ),
  get('/users/:userId/achievements/progress', 'achievements:read', "Get a user's progress toward achievements"),
  get('/users/:userId/challenges', 'challenges:read', "List a user's challenges"),
  get(
    '/users/:userId/challenges/:challengeId',
    'challenges:read',
    "Get a user's progress on a challenge"
  ),
  get('/xp/summary', 'xp:read', 'Get project XP totals'),
  get('/levels', 'levels:read', 'List levels'),
  { method: 'POST', path: '/levels', scope: 'levels:write', summary: 'Create a level' },
  get('/levels/:levelId', 'levels:read', 'Get a level'),
  { method: 'PATCH', path: '/levels/:levelId', scope: 'levels:write', summary: 'Update a level' },
  get('/progression/summary', 'levels:read', 'Get level distribution'),
  get('/leaderboard', 'leaderboard:read', 'Get the leaderboard'),
  get('/leaderboard/:userId', 'leaderboard:read', "Get a user's rank"),
  get('/achievements', 'achievements:read', 'List achievements'),
  get('/achievements/summary', 'achievements:read', 'Get achievement totals'),
  get('/achievements/:achievementId', 'achievements:read', 'Get an achievement'),
  get('/challenges', 'challenges:read', 'List challenges'),
  get('/challenges/summary', 'challenges:read', 'Get challenge totals'),
  get('/challenges/:challengeId', 'challenges:read', 'Get a challenge'),
  get('/streaks', 'streaks:read', 'List streaks'),
  get('/users/:userId/streaks', 'streaks:read', "List a user's streaks"),
  get('/users/:userId/streaks/history', 'streaks:read', "List a user's streak history"),
];
