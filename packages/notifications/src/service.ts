import { randomUUID } from 'crypto';
import {
  db,
  emailNotificationOutbox,
  endUsers,
  integrationDeliveries,
  integrations,
  notificationOutbox,
  notificationPreferences,
  notifications,
  NotificationRecord,
} from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { renderEmailTemplate } from './email/templates.js';
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

  // 5. If new notification created, evaluate channel delivery preferences and insert outbox intents atomically
  if (inserted) {
    // Query notification preferences for this user and type
    const prefRows = await tx
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.projectId, params.projectId),
          eq(notificationPreferences.userId, params.userId),
          eq(notificationPreferences.notificationType, params.type)
        )
      );

    const inAppPref = prefRows.find((p) => p.channel === 'in_app');
    const emailPref = prefRows.find((p) => p.channel === 'email');

    // Default rules: In-App is enabled by default (true), Email is disabled by default (false) unless explicitly enabled
    const inAppEnabled = inAppPref ? inAppPref.enabled : true;
    const emailEnabled = emailPref ? emailPref.enabled : false;

    // A) In-App Delivery Intent
    if (inAppEnabled) {
      await tx.insert(notificationOutbox).values({
        id: outboxId,
        projectId: params.projectId,
        notificationId: inserted.id,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
      });
    }

    // B) Email Delivery Intent
    if (emailEnabled) {
      const [userRow] = await tx
        .select({ email: endUsers.email })
        .from(endUsers)
        .where(and(eq(endUsers.projectId, params.projectId), eq(endUsers.id, params.userId)));

      if (userRow && userRow.email && userRow.email.includes('@')) {
        const { subject, htmlBody, textBody } = renderEmailTemplate(
          params.type,
          params.data as unknown as Record<string, unknown>
        );

        const emailOutboxId = `eob_${randomUUID()}`;
        await tx
          .insert(emailNotificationOutbox)
          .values({
            id: emailOutboxId,
            projectId: params.projectId,
            notificationId: inserted.id,
            userId: params.userId,
            recipientEmail: userRow.email,
            subject,
            htmlBody,
            textBody,
            status: 'pending',
            attempts: 0,
            availableAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }

    // C) External Integration Delivery Intents (e.g. Discord)
    try {
      const activeIntegrations = await tx
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.projectId, params.projectId),
            eq(integrations.enabled, true),
            eq(integrations.status, 'active')
          )
        );

      for (const intg of activeIntegrations) {
        const cfg = (intg.config as Record<string, unknown>) || {};
        const enabledEvents = Array.isArray(cfg.enabledEvents)
          ? (cfg.enabledEvents as string[])
          : [];

        if (enabledEvents.length === 0 || enabledEvents.includes(params.type)) {
          const deliveryId = `idel_${randomUUID()}`;
          await tx
            .insert(integrationDeliveries)
            .values({
              id: deliveryId,
              integrationId: intg.id,
              projectId: params.projectId,
              notificationId: inserted.id,
              eventId: null,
              eventType: params.type,
              status: 'pending',
              attempts: 0,
              availableAt: new Date(),
            })
            .onConflictDoNothing();
        }
      }
    } catch {}

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
