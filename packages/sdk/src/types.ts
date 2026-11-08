export interface RetryConfig {
  /** Maximum number of retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 300) */
  initialDelayMs?: number;
  /** Maximum delay cap in milliseconds between retries (default: 3000) */
  maxDelayMs?: number;
}

export interface GamiConfig {
  /** Server-side Gami API key (starts with gami_live_). Never put this in browser code. */
  apiKey?: string;
  /** Short-lived token for one end user, created by your backend. Safe in a browser. */
  endUserToken?: string;
  /** Allows an API key in a browser. Anyone visiting the page can read it, so avoid this. */
  dangerouslyAllowBrowser?: boolean;
  /** Base URL for the Gami API server (default: http://localhost:3001) */
  baseUrl?: string;
  /** Timeout in milliseconds for API requests (default: 10000ms) */
  timeout?: number;
  /** Retry configuration for transient failures */
  retry?: RetryConfig;
  /** Custom HTTP headers to include on every request */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Events API Types
// ---------------------------------------------------------------------------

export interface TrackEventParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  /** Target user ID (or use externalId if resolving external user) */
  userId?: string;
  /** External User ID for auto-resolution */
  externalId?: string;
  /** Event name/type (e.g. 'purchase', 'user_signup', 'lesson_completed') */
  type: string;
  /** Event payload properties */
  properties?: Record<string, unknown>;
  /** Timestamp when event occurred (ISO string or Date) */
  occurredAt?: string | Date;
  /** Optional idempotency key for exact-once event ingestion */
  idempotencyKey?: string;
}

export interface EventIngestionResponse {
  id: string;
  status: 'accepted';
  duplicate: boolean;
}

// ---------------------------------------------------------------------------
// Users API Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  projectId: string;
  externalId: string;
  name: string | null;
  email?: string | null;
  avatarUrl: string | null;
  metadata: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetUserParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface GetUserByExternalIdParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  externalId: string;
}

export interface CreateUserParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  externalId: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
}

export interface DeleteUserParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface UserListResponse {
  page: number;
  limit: number;
  total: number;
  users: UserRecord[];
}

// ---------------------------------------------------------------------------
// XP API Types
// ---------------------------------------------------------------------------

export interface GetXpParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface XpBalanceResponse {
  projectId: string;
  userId: string;
  totalXp: number;
}

export interface GetXpLedgerParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
  page?: number;
  limit?: number;
}

export interface XpLedgerEntry {
  id: string;
  projectId: string;
  userId: string;
  eventId?: string | null;
  ruleId?: string | null;
  ruleExecutionId?: string | null;
  idempotencyKey?: string | null;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface XpLedgerResponse {
  projectId: string;
  userId: string;
  page: number;
  limit: number;
  total: number;
  entries: XpLedgerEntry[];
}

export interface AdjustXpParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
  /** Optional idempotency key. If omitted, one is generated per invocation and reused on retries. */
  idempotencyKey?: string;
}

export interface XpSummaryResponse {
  projectId: string;
  totalXpAwarded: number;
  totalTransactions: number;
  totalUsersWithXp: number;
  topUsers: {
    userId: string;
    externalId: string;
    totalXp: number;
  }[];
}

// ---------------------------------------------------------------------------
// Streaks API Types
// ---------------------------------------------------------------------------

export interface ListStreaksParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
}

export interface ListUserStreaksParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface StreakHistoryParams extends ListUserStreaksParams {
  /** Only this streak, by key. */
  streak?: string;
  /** Up to 200. Defaults to 50. */
  limit?: number;
}

export interface StreakDefinitionRecord {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  cadence: 'daily' | 'weekly';
  timeZone: string;
  freezeEvery: number;
  maxFreezes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserStreakRecord {
  streakId: string;
  key: string;
  name: string;
  cadence: 'daily' | 'weekly';
  /** Zero once the streak has ended, even before the user's next action. */
  current: number;
  longest: number;
  freezes: number;
  /** True when the user has not yet been active in the current period. */
  atRisk: boolean;
  timeZone: string;
  lastActivityAt: string | null;
}

export interface StreakChangeRecord {
  id: string;
  streakKey: string;
  change: 'started' | 'extended' | 'frozen' | 'reset';
  current: number;
  freezesUsed: number;
  freezesEarned: number;
  brokenStreak: number;
  eventId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Achievements API Types
// ---------------------------------------------------------------------------

export interface ListAchievementsParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
}

export interface GetAchievementParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  achievementId: string;
}

export interface ListUserAchievementsParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface AchievementRecord {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  secret?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserAchievementRecord {
  id: string;
  projectId: string;
  userId: string;
  achievementId: string;
  eventId?: string | null;
  ruleExecutionId?: string | null;
  unlockedAt: string;
  achievement?: AchievementRecord;
}

export interface AchievementSummaryResponse {
  projectId: string;
  totalAchievements: number;
  totalUnlockedCount: number;
  uniqueUsersUnlocked: number;
}

// ---------------------------------------------------------------------------
// Levels & Progression API Types
// ---------------------------------------------------------------------------

export interface ListLevelsParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
}

export interface GetUserProgressParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface LevelRecord {
  id: string;
  projectId: string;
  level: number;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  requiredXp: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLevelParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  level: number;
  name: string;
  description?: string;
  iconUrl?: string;
  requiredXp: number;
  enabled?: boolean;
}

export interface UpdateLevelParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  levelId: string;
  level?: number;
  name?: string;
  description?: string;
  iconUrl?: string;
  requiredXp?: number;
  enabled?: boolean;
}

export interface UserProgressResponse {
  projectId: string;
  userId: string;
  totalXp: number;
  level: { number: number; name: string; requiredXp: number };
  nextLevel: { number: number; name: string; requiredXp: number } | null;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface LevelSummaryResponse {
  projectId: string;
  totalLevels: number;
  minLevel: number;
  maxLevel: number;
  maxRequiredXp: number;
}

// ---------------------------------------------------------------------------
// Leaderboards API Types
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';

export interface ListLeaderboardParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  period?: LeaderboardPeriod;
  page?: number;
  limit?: number;
  search?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  avatarUrl: string | null;
  xp: number;
  level?: number;
  levelName?: string;
}

export interface ListLeaderboardResponse {
  projectId: string;
  period: LeaderboardPeriod;
  page: number;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

export interface GetUserRankParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
  period?: LeaderboardPeriod;
}

export interface UserRankResponse {
  projectId: string;
  userId: string;
  period: LeaderboardPeriod;
  rank: number | null;
  totalXp: number;
  totalParticipants: number;
}

// ---------------------------------------------------------------------------
// Challenges API Types
// ---------------------------------------------------------------------------

export interface ListChallengesParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
}

export interface GetChallengeParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  challengeId: string;
}

export interface ListUserChallengesParams {
  /** Optional. Without it, the API key decides the project. */
  projectId?: string;
  userId: string;
}

export interface ChallengeRecord {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  targetCount: number;
  rewards?: Record<string, unknown>;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserChallengeProgressRecord {
  id: string;
  projectId: string;
  userId: string;
  challengeId: string;
  currentCount: number;
  targetCount: number;
  completed: boolean;
  completedAt?: string | null;
  challenge?: ChallengeRecord;
}

export interface ChallengeSummaryResponse {
  projectId: string;
  totalChallenges: number;
  activeChallenges: number;
  completedParticipations: number;
}

// ---------------------------------------------------------------------------
// Notifications API Types
// ---------------------------------------------------------------------------

export interface ListNotificationsParams {
  projectId: string;
  userId: string;
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface GetUnreadCountParams {
  projectId: string;
  userId: string;
}

export interface MarkNotificationReadParams {
  projectId: string;
  userId: string;
  notificationId: string;
}

export interface MarkAllNotificationsReadParams {
  projectId: string;
  userId: string;
}

export interface NotificationRecord {
  id: string;
  projectId: string;
  userId: string;
  type: 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed' | string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  sourceType: string;
  sourceId: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListNotificationsResponse {
  notifications: NotificationRecord[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Webhooks API Types
// ---------------------------------------------------------------------------

export type SdkWebhookEventType =
  | 'xp.awarded'
  | 'achievement.unlocked'
  | 'level.up'
  | 'challenge.completed'
  | 'user.created'
  | 'user.deactivated'
  | 'webhook.test';

export interface WebhookEndpointRecord {
  id: string;
  projectId: string;
  name: string;
  url: string;
  description?: string | null;
  active: boolean;
  events: SdkWebhookEventType[];
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string | null;
  failureCount: number;
  disabledReason?: string | null;
}

export interface WebhookDeliveryRecord {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: SdkWebhookEventType;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  attempts: number;
  availableAt: string;
  deliveredAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface ListWebhooksParams {
  projectId: string;
}

export interface GetWebhookParams {
  projectId: string;
  webhookId: string;
}

export interface CreateWebhookParams {
  projectId: string;
  name: string;
  url: string;
  description?: string;
  events: SdkWebhookEventType[];
}

export interface UpdateWebhookParams {
  projectId: string;
  webhookId: string;
  name?: string;
  url?: string;
  description?: string;
  active?: boolean;
  events?: SdkWebhookEventType[];
}

export interface DeleteWebhookParams {
  projectId: string;
  webhookId: string;
}

export interface RotateWebhookSecretParams {
  projectId: string;
  webhookId: string;
}

export interface TestWebhookParams {
  projectId: string;
  webhookId: string;
}

export interface ListWebhookDeliveriesParams {
  projectId: string;
  webhookId: string;
  page?: number;
  limit?: number;
  status?: string;
  eventType?: string;
}

export interface ReplayWebhookDeliveryParams {
  projectId: string;
  webhookId: string;
  deliveryId: string;
}

export interface WebhookDeliveryListResponse {
  deliveries: WebhookDeliveryRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogRecord {
  id: string;
  projectId: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ListAuditLogsParams {
  projectId: string;
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogsListResponse {
  auditLogs: AuditLogRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReplayEventParams {
  projectId: string;
  eventId: string;
}

export interface SystemMetricsResponse {
  projectId: string;
  timestamp: string;
  health: {
    api: string;
    postgres: string;
    redis: string;
    worker: string;
    workerAlive: boolean;
  };
  outbox: {
    eventOutboxPending: number;
    challengeRewardOutboxPending: number;
    notificationOutboxPending: number;
    webhookOutboxPending: number;
    staleProcessingRecords: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  process: Record<string, unknown>;
}

export interface NotificationPreferenceItem {
  id?: string | null;
  projectId: string;
  userId: string;
  channel: 'in_app' | 'email';
  notificationType: 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed';
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetNotificationPreferencesParams {
  projectId: string;
  userId: string;
}

export interface UpdateNotificationPreferencesParams {
  projectId: string;
  userId: string;
  preferences: Array<{
    channel: 'in_app' | 'email';
    notificationType: 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed';
    enabled: boolean;
  }>;
}

export interface NotificationPreferencesResponse {
  projectId: string;
  userId: string;
  preferences: NotificationPreferenceItem[];
}

// ---------------------------------------------------------------------------
// External Integrations API Types
// ---------------------------------------------------------------------------

export interface IntegrationRecord {
  id: string;
  projectId: string;
  provider: 'discord' | 'slack' | 'teams' | string;
  name: string;
  status: 'active' | 'disabled' | 'error';
  enabled: boolean;
  lastTestedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  config: {
    guildId?: string | null;
    channelId?: string | null;
    guildName?: string | null;
    channelName?: string | null;
    enabledEvents?: string[];
    configured: boolean;
  };
}

export interface CreateIntegrationParams {
  name: string;
  provider: string;
  webhookUrl?: string;
  enabledEvents?: string[];
  config?: Record<string, unknown>;
}

export interface UpdateIntegrationParams {
  name?: string;
  enabled?: boolean;
  enabledEvents?: string[];
  webhookUrl?: string;
}

export interface IntegrationDeliveryRecord {
  id: string;
  integrationId: string;
  projectId: string;
  notificationId: string | null;
  eventId: string | null;
  eventType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  availableAt: string;
  processingAt: string | null;
  completedAt: string | null;
  replayedAt: string | null;
  lastError: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListIntegrationDeliveriesParams {
  page?: number;
  limit?: number;
  status?: string;
}

export interface ListIntegrationDeliveriesResponse {
  deliveries: IntegrationDeliveryRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedTemplate {
  title?: string;
  description?: string;
  url?: string;
  color?: number | string;
  authorName?: string;
  footerText?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  fields?: DiscordEmbedField[];
}

export interface GetTemplatesResponse {
  enabledEvents: string[];
  customTemplates: Record<string, DiscordEmbedTemplate>;
  defaultTemplates: Record<string, DiscordEmbedTemplate>;
  placeholders: Record<string, Array<{ key: string; description: string }>>;
}

export interface UpdateTemplatesParams {
  enabledEvents?: string[];
  customTemplates?: Record<string, DiscordEmbedTemplate>;
}

export interface PreviewTemplateParams {
  eventType: string;
  template?: DiscordEmbedTemplate;
}

export interface PreviewTemplateResponse {
  payload: {
    embeds: Array<{
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      author?: { name: string };
      footer?: { text: string };
      thumbnail?: { url: string };
      image?: { url: string };
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      timestamp?: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Organization & Team Management API Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Analytics API Types
// ---------------------------------------------------------------------------

export type AnalyticsDateRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom';

export interface AnalyticsQueryOptions {
  range?: AnalyticsDateRangePreset;
  startDate?: string;
  endDate?: string;
  type?: 'overview' | 'users' | 'events' | 'xp' | 'achievements' | 'challenges';
}

export interface AnalyticsOverviewResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  totalUsers: number;
  activeUsers: number;
  eventsProcessed: number;
  xpAwarded: number;
  achievementsUnlocked: number;
  challengesCompleted: number;
}

export interface AnalyticsUsersResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  userGrowthOverTime: Array<{ date: string; count: number }>;
}

export interface AnalyticsEventsResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  totalEvents: number;
  eventVolumeOverTime: Array<{ date: string; count: number }>;
  topEventTypes: Array<{ type: string; count: number }>;
}

export interface AnalyticsGamificationResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  totalXpAwarded: number;
  avgXpPerUser: number;
  xpAwardedOverTime: Array<{ date: string; totalXp: number }>;
  topAchievements: Array<{ id: string; name: string; unlockedCount: number }>;
  challenges: { started: number; completed: number; completionRatePercent: number };
  topTriggeredRules: Array<{ id: string; name: string; trigger: string; executionCount: number }>;
}

export interface AnalyticsNotificationsResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  inAppNotificationsGenerated: number;
  outbox: { pending: number; completed: number; failed: number };
}

export interface AnalyticsIntegrationsResponse {
  projectId: string;
  dateRange: { preset: AnalyticsDateRangePreset; startDate: string; endDate: string };
  webhooks: { delivered: number; failed: number };
  integrations: { delivered: number; failed: number };
}



