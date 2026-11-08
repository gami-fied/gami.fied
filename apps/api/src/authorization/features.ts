import { type FeatureKey } from '@gami/database';

/** First path segment under `/api/projects/:projectId/` to the feature it belongs to. */
const PROJECT_SEGMENTS: Record<string, FeatureKey> = {
  achievements: 'achievements',
  streaks: 'streaks',
  challenges: 'challenges',
  boosts: 'boosts_limits',
  limits: 'boosts_limits',
  abuse: 'boosts_limits',
  levels: 'levels',
  progression: 'levels',
  leaderboard: 'leaderboards',
  segments: 'segments',
  leagues: 'leagues',
  currencies: 'wallets',
  rewards: 'store',
  redemptions: 'store',
  'referral-program': 'referrals',
  referrals: 'referrals',
  campaigns: 'campaigns',
  stream: 'realtime',
  webhooks: 'webhooks',
  'webhook-deliveries': 'webhooks',
  integrations: 'integrations',
  connectors: 'connectors',
  analytics: 'analytics',
  promotion: 'environments',
};

/** Second segment under `/users/:userId/`. */
const USER_SEGMENTS: Record<string, FeatureKey> = {
  achievements: 'achievements',
  streaks: 'streaks',
  challenges: 'challenges',
  progress: 'levels',
  wallets: 'wallets',
  rewards: 'store',
  redemptions: 'store',
  leagues: 'leagues',
  friends: 'social',
  kudos: 'social',
  feed: 'social',
  referral: 'referrals',
  ranking: 'boosts_limits',
};

/** The feature a project route needs, from its pattern such as `/api/projects/:projectId/users/:userId/wallets`. */
export function featureForProjectRoute(routeUrl: string): FeatureKey | null {
  const match = routeUrl.match(/^\/api\/projects\/[^/]+\/(.*)$/);
  if (!match) return null;
  const [first, , third] = (match[1] ?? '').split('/');
  if (first === 'users' && third) return USER_SEGMENTS[third] ?? null;
  return (first && PROJECT_SEGMENTS[first]) || null;
}

/** Player routes under `/v1/me/`. */
const PLAYER_SEGMENTS: Record<string, FeatureKey> = {
  achievements: 'achievements',
  streaks: 'streaks',
  challenges: 'challenges',
  leaderboard: 'leaderboards',
  rank: 'leaderboards',
  wallets: 'wallets',
  rewards: 'store',
  redemptions: 'store',
  leagues: 'leagues',
  friends: 'social',
  kudos: 'social',
  feed: 'social',
  referral: 'referrals',
  stream: 'realtime',
  devices: 'push',
};

export function featureForPlayerPath(url: string): FeatureKey | null {
  const path = url.split('?')[0] ?? '';
  const match = path.match(/^\/v1\/me\/([^/]+)/);
  if (!match) return null;
  // Sharing an achievement is a social feature, even though it sits under achievements.
  if (/^\/v1\/me\/achievements\/[^/]+\/share$/.test(path)) return 'social';
  return PLAYER_SEGMENTS[match[1]!] ?? null;
}

export function featureDisabledBody(feature: FeatureKey) {
  return {
    code: 'FEATURE_DISABLED',
    feature,
    message: `This feature (${feature}) is turned off for this organization by the platform administrator.`,
  };
}
