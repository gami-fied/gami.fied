import { getSmtpProviderFromConfig } from '@gami/notifications';
import { decryptSecret } from '@gami/webhooks';
import { ServerConfigService } from './server-config.service.js';
import { createLogger } from '@gami/config';

const log = createLogger('PlatformEmail');

export interface PlatformEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function resolveProvider() {
  const cfg = await ServerConfigService.getConfig<Record<string, unknown>>('smtp');
  if (!cfg?.host) return getSmtpProviderFromConfig();

  return getSmtpProviderFromConfig({
    host: cfg.host as string,
    port: (cfg.port as number) || 587,
    user: (cfg.user as string) || '',
    password: cfg.encryptedPassword ? decryptSecret(cfg.encryptedPassword as string) : '',
    fromEmail: (cfg.fromEmail as string) || 'noreply@gami.engine',
    fromName: (cfg.fromName as string) || 'Gami Security',
    secure: Boolean(cfg.secure),
  });
}

/**
 * Sends a transactional account email using the SMTP settings saved in the admin area,
 * falling back to SMTP_* environment variables. Returns false when it could not be sent,
 * so callers can tell the user instead of claiming success.
 */
export async function sendPlatformEmail(email: PlatformEmail): Promise<boolean> {
  try {
    const provider = await resolveProvider();
    if (!provider) {
      log.warn(`SMTP is not configured, so "${email.subject}" was not sent`);
      return false;
    }
    await provider.sendEmail(email);
    return true;
  } catch (err) {
    log.error('Failed to send email:', err);
    return false;
  }
}
