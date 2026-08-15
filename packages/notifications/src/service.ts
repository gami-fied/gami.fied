import { randomUUID } from 'crypto';
import { db, notificationOutbox, notifications, NotificationRecord } from '@gami/database';
import { generateNotificationText } from './templates.js';
import { CreateNotificationIntentParams, NotificationType } from './types.js';

export type DBTransactionClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const VALID_NOTIFICATION_TYPES: NotificationType[] = [
  'xp_awarded',
  'achievement_unlocked',
  'level_up',
  'challenge_completed',
];

export async function createNotificationIntent<T extends NotificationType>(
  tx: DBTransactionClient,
  params: CreateNotificationIntentParams<T>
): Promise<{ status: 'created' | 'skipped'; notification?: NotificationRecord }> {
  // 1. Context validation
  if (!params.projectId || !params.projectId.trim()) {
    throw new Error('createNotificationIntent requires a valid projectId');
  }
  if (!params.userId || !params.userId.trim()) {
    throw new Error('createNotificationIntent requires a valid userId');
  }
  if (
    !params.sourceType ||
    !params.sourceType.trim() ||
    !params.sourceId ||
    !params.sourceId.trim()
  ) {
    throw new Error('createNotificationIntent requires valid sourceType and sourceId parameters');
  }

  // 2. Notification type validation
  if (!VALID_NOTIFICATION_TYPES.includes(params.type)) {
    throw new Error(`Invalid notification type: ${params.type}`);
  }

  // 3. Generate title and message via centralized template
  const { title, message } = generateNotificationText(params.type, params.data);

  const notificationId = `notif_${randomUUID()}`;
  const outboxId = `nob_${randomUUID()}`;

  // 4. Insert notification with DB-enforced idempotency
  const [inserted] = await tx
    .insert(notifications)
    .values({
      id: notificationId,
      projectId: params.projectId,
      userId: params.userId,
      type: params.type,
      title,
      message,
      data: params.data as unknown as Record<string, unknown>,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    })
    .onConflictDoNothing({
      target: [
        notifications.projectId,
        notifications.userId,
        notifications.sourceType,
        notifications.sourceId,
      ],
    })
    .returning();

  // 5. If new notification created, insert into notification_outbox in same transaction
  if (inserted) {
    await tx.insert(notificationOutbox).values({
      id: outboxId,
      projectId: params.projectId,
      notificationId: inserted.id,
      status: 'pending',
      attempts: 0,
      availableAt: new Date(),
    });

    return { status: 'created', notification: inserted };
  }

  // 6. Duplicate source operation -> Idempotent Success/No-Op
  return { status: 'skipped' };
}

export function generateLevelUpSourceId(projectId: string, userId: string, level: number): string {
  return `${projectId}:${userId}:${level}`;
}

export function generateChallengeCompletionSourceId(
  projectId: string,
  userId: string,
  challengeId: string
): string {
  return `${projectId}:${userId}:${challengeId}:completed`;
}
