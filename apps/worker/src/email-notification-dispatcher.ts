import { db, emailNotificationOutbox, serverConfigs, getPlatformSettings } from '@gami/database';
import {
  createUnsubscribeToken,
  getSmtpProviderFromConfig,
  SmtpConfig,
  SmtpEmailProvider,
} from '@gami/notifications';
import { decryptSecret } from '@gami/webhooks';
import { and, count, eq, gte } from 'drizzle-orm';
import { claimDueRows } from './outbox.js';
import { createLogger } from '@gami/config';

const log = createLogger('EmailDispatcher');

let cachedSmtpProvider: SmtpEmailProvider | null = null;
let lastSmtpFetchTime = 0;

export function clearSmtpProviderCache() {
  cachedSmtpProvider = null;
  lastSmtpFetchTime = 0;
}

/**
 * Retrieves the SmtpEmailProvider instance from DB server_configs ('smtp_config')
 * or falls back to environment configuration.
 * Caches the provider for 30 seconds to avoid DB spam on every tick.
 */
export async function getActiveSmtpProvider(): Promise<SmtpEmailProvider | null> {
  const now = Date.now();
  if (cachedSmtpProvider && now - lastSmtpFetchTime < 30000) {
    return cachedSmtpProvider;
  }

  try {
    const [row] = await db
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.key, 'smtp_config'));

    if (row && row.value) {
      const cfgData = row.value as Record<string, unknown>;
      const host = cfgData.host as string;
      const port = Number(cfgData.port) || 587;
      const user = cfgData.user as string;
      const encryptedPass = cfgData.encryptedPassword as string;
      const fromEmail = cfgData.fromEmail as string;
      const fromName = cfgData.fromName as string;
      const secure = Boolean(cfgData.secure);

      let password = '';
      if (encryptedPass) {
        try {
          password = decryptSecret(encryptedPass);
        } catch {
          password = encryptedPass;
        }
      }

      if (host && fromEmail) {
        const config: SmtpConfig = {
          host,
          port,
          user,
          password,
          fromEmail,
          fromName,
          secure,
        };
        cachedSmtpProvider = getSmtpProviderFromConfig(config);
        lastSmtpFetchTime = now;
        return cachedSmtpProvider;
      }
    }
  } catch (err) {
    log.error('Error loading SMTP config from database:', (err as Error).message);
  }

  // Fallback to environment configuration
  cachedSmtpProvider = getSmtpProviderFromConfig();
  lastSmtpFetchTime = now;
  return cachedSmtpProvider;
}

export function calculateEmailBackoff(attempt: number): Date {
  const backoffSeconds = [5, 30, 120, 600, 3600];
  const delaySec = backoffSeconds[Math.min(attempt - 1, backoffSeconds.length - 1)] || 3600;
  return new Date(Date.now() + delaySec * 1000);
}

/**
 * Dispatches pending email notification outbox records atomically.
 */
/** Adds a visible link, and the headers mail clients use for their own unsubscribe button. */
function withUnsubscribe(record: {
  projectId: string | null;
  userId: string | null;
  htmlBody: string;
  textBody: string;
}) {
  if (!record.projectId || !record.userId) {
    return { html: record.htmlBody, text: record.textBody };
  }

  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
  const token = createUnsubscribeToken({ projectId: record.projectId, userId: record.userId });
  const url = `${baseUrl}/v1/email/unsubscribe?token=${encodeURIComponent(token)}`;

  return {
    html: `${record.htmlBody}<p style="font-size:12px;color:#71717a"><a href="${url}">Unsubscribe</a></p>`,
    text: `${record.textBody}\n\nUnsubscribe: ${url}`,
    headers: {
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

async function hasReachedDailyLimit(recipientEmail: string, limit: number): Promise<boolean> {
  const [sent] = await db
    .select({ total: count() })
    .from(emailNotificationOutbox)
    .where(
      and(
        eq(emailNotificationOutbox.recipientEmail, recipientEmail),
        eq(emailNotificationOutbox.status, 'completed'),
        gte(emailNotificationOutbox.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      )
    );
  return (sent?.total ?? 0) >= limit;
}

export async function dispatchPendingEmailNotifications(
  batchLimit = 50,
  forceNow?: Date
): Promise<{ processedCount: number; completedCount: number; failedCount: number }> {

  // 1. Claim due records
  const pendingRecords = await claimDueRows(emailNotificationOutbox, batchLimit, forceNow);

  if (pendingRecords.length === 0) {
    return { processedCount: 0, completedCount: 0, failedCount: 0 };
  }

  const provider = await getActiveSmtpProvider();
  const { maxDailyEmailsPerUser, retryAttempts } = await getPlatformSettings('notifications');

  let completedCount = 0;
  let failedCount = 0;

  for (const record of pendingRecords) {
    if (!provider) {
      // SMTP not configured -> delay retry
      const nextAvailable = calculateEmailBackoff(record.attempts + 1);
      await db
        .update(emailNotificationOutbox)
        .set({
          status: 'pending',
          attempts: record.attempts + 1,
          lastError: 'SMTP provider not configured on server',
          availableAt: nextAvailable,
          processingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailNotificationOutbox.id, record.id));
      failedCount++;
      continue;
    }

    if (await hasReachedDailyLimit(record.recipientEmail, maxDailyEmailsPerUser)) {
      // Waiting is not a failure, so this does not use up an attempt.
      await db
        .update(emailNotificationOutbox)
        .set({
          status: 'pending',
          lastError: 'Daily email limit reached for this recipient',
          availableAt: new Date(Date.now() + 60 * 60 * 1000),
          processingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailNotificationOutbox.id, record.id));
      continue;
    }

    try {
      await provider.sendEmail({
        to: record.recipientEmail,
        subject: record.subject,
        ...withUnsubscribe(record),
      });

      // Mark as completed
      await db
        .update(emailNotificationOutbox)
        .set({
          status: 'completed',
          processingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailNotificationOutbox.id, record.id));

      completedCount++;
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || String(err);
      const attempts = record.attempts + 1;
      const isPermanentFailure = attempts > retryAttempts;

      await db
        .update(emailNotificationOutbox)
        .set({
          status: isPermanentFailure ? 'failed' : 'pending',
          attempts,
          lastError: errorMsg,
          availableAt: isPermanentFailure ? record.availableAt : calculateEmailBackoff(attempts),
          processingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailNotificationOutbox.id, record.id));

      failedCount++;
    }
  }

  return {
    processedCount: pendingRecords.length,
    completedCount,
    failedCount,
  };
}
