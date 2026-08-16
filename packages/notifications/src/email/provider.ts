import nodemailer from 'nodemailer';
import type { EmailMessage, EmailProvider, SmtpConfig } from './types.js';

export class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;
  private fromName: string;

  constructor(config: SmtpConfig) {
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || 'Gami Engine';

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? (config.port === 465),
      auth: config.user
        ? {
            user: config.user,
            pass: config.password || '',
          }
        : undefined,
      tls: {
        rejectUnauthorized: false, // Fail-safe for local testing / self-signed SMTP
      },
    });
  }

  public async sendEmail(message: EmailMessage): Promise<void> {
    const fromAddress = this.fromName ? `"${this.fromName}" <${this.fromEmail}>` : this.fromEmail;
    await this.transporter.sendMail({
      from: fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  public async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      console.error('[SmtpEmailProvider] SMTP Connection verification failed:', (err as Error).message);
      return false;
    }
  }
}

/**
 * Gets a configured SmtpEmailProvider instance from custom config or process environment variables.
 */
export function getSmtpProviderFromConfig(customConfig?: SmtpConfig): SmtpEmailProvider | null {
  if (customConfig && customConfig.host && customConfig.fromEmail) {
    return new SmtpEmailProvider(customConfig);
  }

  const envHost = process.env.SMTP_HOST;
  const envPort = Number(process.env.SMTP_PORT) || 587;
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASSWORD;
  const envFromEmail = process.env.SMTP_FROM_EMAIL;
  const envFromName = process.env.SMTP_FROM_NAME || 'Gami Engine';
  const envSecure = process.env.SMTP_SECURE === 'true' || envPort === 465;

  if (envHost && envFromEmail) {
    return new SmtpEmailProvider({
      host: envHost,
      port: envPort,
      user: envUser,
      password: envPass,
      fromEmail: envFromEmail,
      fromName: envFromName,
      secure: envSecure,
    });
  }

  return null;
}
