export type NotificationType =
  'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed' | 'points_expiring' | 'prize_won';

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

/** A prize from a shared goal, a leaderboard place, a journey or a box. */
export interface PrizeWonPayload {
  /** What it was for, such as `Top 3 this week`. */
  title: string;
  /** What was won, such as `50 XP, 20 gems`. */
  prizes: string;
}

export type NotificationPayloadMap = {
  xp_awarded: XpAwardedPayload;
  achievement_unlocked: AchievementUnlockedPayload;
  level_up: LevelUpPayload;
  challenge_completed: ChallengeCompletedPayload;
  points_expiring: PointsExpiringPayload;
  prize_won: PrizeWonPayload;
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
