import {
  db,
  emailNotificationOutbox,
  EmailNotificationOutboxRecord,
  serverConfigs,
} from '@gami/database';
import {
  getSmtpProviderFromConfig,
  SmtpConfig,
  SmtpEmailProvider,
} from '@gami/notifications';
import { decryptSecret } from '@gami/webhooks';
import { and, eq, lte } from 'drizzle-orm';

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
    console.error('[EmailDispatcher] Error loading SMTP config from database:', (err as Error).message);
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
export async function dispatchPendingEmailNotifications(
  batchLimit = 50,
  forceNow?: Date
): Promise<{ processedCount: number; completedCount: number; failedCount: number }> {
  const now = forceNow || new Date();

  // 1. Select pending outbox records using FOR UPDATE SKIP LOCKED
  const pendingRecords = await db.transaction(async (tx) => {
    const query = tx
      .select()
      .from(emailNotificationOutbox)
      .where(
        and(
          eq(emailNotificationOutbox.status, 'pending'),
          lte(emailNotificationOutbox.availableAt, now)
        )
      )
      .limit(batchLimit);

    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      return await query.for('update', { skipLocked: true });
    }
    return await query;
  });

  if (pendingRecords.length === 0) {
    return { processedCount: 0, completedCount: 0, failedCount: 0 };
  }

  const provider = await getActiveSmtpProvider();

  let completedCount = 0;
  let failedCount = 0;

  for (const record of pendingRecords) {
    // Mark as processing
    await db
      .update(emailNotificationOutbox)
      .set({
        status: 'processing',
        processingAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailNotificationOutbox.id, record.id));

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

    try {
      await provider.sendEmail({
        to: record.recipientEmail,
        subject: record.subject,
        html: record.htmlBody,
        text: record.textBody,
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
      const isPermanentFailure = attempts >= 10;

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
