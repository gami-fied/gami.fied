import { NotificationType, NotificationPayloadMap } from './types.js';

export interface GeneratedNotificationText {
  title: string;
  message: string;
}

export function generateNotificationText<T extends NotificationType>(
  type: T,
  data: NotificationPayloadMap[T]
): GeneratedNotificationText {
  switch (type) {
    case 'xp_awarded': {
      const payload = data as NotificationPayloadMap['xp_awarded'];
      const reasonText = payload.reason ? ` for ${payload.reason}` : '';
      return {
        title: 'XP Awarded',
        message: `You earned ${payload.amount} XP${reasonText}!`,
      };
    }
    case 'achievement_unlocked': {
      const payload = data as NotificationPayloadMap['achievement_unlocked'];
      return {
        title: 'Achievement Unlocked!',
        message: `Achievement unlocked: ${payload.achievementName}`,
      };
    }
    case 'level_up': {
      const payload = data as NotificationPayloadMap['level_up'];
      return {
        title: 'Level Up!',
        message: `Congratulations! You reached Level ${payload.newLevel} (${payload.levelName}).`,
      };
    }
    case 'challenge_completed': {
      const payload = data as NotificationPayloadMap['challenge_completed'];
      return {
        title: 'Challenge Completed!',
        message: `Challenge completed: ${payload.challengeName}`,
      };
    }
    default: {
      return {
        title: 'Notification',
        message: 'You have a new notification.',
      };
    }
  }
}
