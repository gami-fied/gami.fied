export type NotificationType =
  'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed' | 'points_expiring';

export interface XpAwardedPayload {
  amount: number;
  reason?: string;
  totalXp?: number;
}

export interface AchievementUnlockedPayload {
  achievementId: string;
  achievementKey: string;
  achievementName: string;
  iconUrl?: string | null;
}

export interface LevelUpPayload {
  previousLevel?: number;
  newLevel: number;
  levelName: string;
}

export interface ChallengeCompletedPayload {
  challengeId: string;
  challengeKey: string;
  challengeName: string;
}

export interface PointsExpiringPayload {
  currency: string;
  currencyName: string;
  amount: number;
  expiresAt: string;
}

export type NotificationPayloadMap = {
  xp_awarded: XpAwardedPayload;
  achievement_unlocked: AchievementUnlockedPayload;
  level_up: LevelUpPayload;
  challenge_completed: ChallengeCompletedPayload;
  points_expiring: PointsExpiringPayload;
};

export type NotificationPayload<T extends NotificationType = NotificationType> =
  NotificationPayloadMap[T];

export interface CreateNotificationIntentParams<T extends NotificationType = NotificationType> {
  projectId: string;
  userId: string;
  type: T;
  data: NotificationPayloadMap[T];
  sourceType: string;
  sourceId: string;
}
