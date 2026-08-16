export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  secure?: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
  verifyConnection(): Promise<boolean>;
}

export interface RenderedEmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}
