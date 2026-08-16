export interface RetryConfig {
  /** Maximum number of retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 300) */
  initialDelayMs?: number;
  /** Maximum delay cap in milliseconds between retries (default: 3000) */
  maxDelayMs?: number;
}

export interface GamiConfig {
  /** Server-side Gami API key (starts with gami_live_) */
  apiKey: string;
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
  /** Project ID scope */
  projectId: string;
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
  success: boolean;
  eventId: string;
  outboxId: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  duplicate?: boolean;
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
  projectId: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetUserParams {
  projectId: string;
  userId: string;
}

export interface GetUserByExternalIdParams {
  projectId: string;
  externalId: string;
}

export interface CreateUserParams {
  projectId: string;
  externalId: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserParams {
  projectId: string;
  userId: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
}

export interface DeleteUserParams {
  projectId: string;
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
  projectId: string;
  userId: string;
}

export interface XpBalanceResponse {
  projectId: string;
  userId: string;
  totalXp: number;
}

export interface GetXpLedgerParams {
  projectId: string;
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
  projectId: string;
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
// Achievements API Types
// ---------------------------------------------------------------------------

export interface ListAchievementsParams {
  projectId: string;
}

export interface GetAchievementParams {
  projectId: string;
  achievementId: string;
}

export interface ListUserAchievementsParams {
  projectId: string;
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
  projectId: string;
}

export interface GetUserProgressParams {
  projectId: string;
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
  projectId: string;
  level: number;
  name: string;
  description?: string;
  iconUrl?: string;
  requiredXp: number;
  enabled?: boolean;
}

export interface UpdateLevelParams {
  projectId: string;
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
  currentXp: number;
  currentLevel: number;
  levelName: string;
  requiredXp: number;
  nextLevelNumber?: number | null;
  nextLevelXp?: number | null;
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
  projectId: string;
  period?: LeaderboardPeriod;
  page?: number;
  limit?: number;
  search?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  externalId: string;
  totalXp: number;
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
  projectId: string;
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
  projectId: string;
}

export interface GetChallengeParams {
  projectId: string;
  challengeId: string;
}

export interface ListUserChallengesParams {
  projectId: string;
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

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  role?: 'owner' | 'admin' | 'member';
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface InviteMemberParams {
  email: string;
  role?: 'admin' | 'member';
}

export interface OrganizationInvitationRecord {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  expiresAt: string;
  inviterId: string;
  inviterName?: string;
  inviterEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitationUrl?: string;
  isExpired?: boolean;
}

export interface ProjectMemberRecord {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: string;
  name: string | null;
  email: string;
  image: string | null;
}


