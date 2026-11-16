import { endUsers, fillTemplate, isFeatureEnabledForProject, loadTranslator, type db } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { renderBaseHtmlLayout } from './email/templates.js';
import { generateNotificationText } from './templates.js';
import type { NotificationType } from './types.js';

type Client = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LocalizedNotification {
  title: string;
  message: string;
  /** The payload with names in the player's language, for the email template. */
  data: Record<string, unknown>;
  /** True when the project wrote this notification's text for the player's language. */
  custom: boolean;
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Words a notification for the player it goes to. With no language on the player, or nothing
 * translated, it is the project's own text. Otherwise the names inside it (the achievement, the
 * challenge, the level, the currency) are translated, and so is the sentence itself when the
 * project wrote one for that notification type, with `{{amount}}`-style places filled in.
 */
export async function localizeNotification(tx: Client, projectId: string, userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<LocalizedNotification> {
  const plain = () => ({ ...generateNotificationText(type, payload as never), data: payload, custom: false });

  const [player] = await tx
    .select({ locale: endUsers.locale })
    .from(endUsers)
    .where(and(eq(endUsers.projectId, projectId), eq(endUsers.id, userId)));
  if (!player?.locale) return plain();
  if (!(await isFeatureEnabledForProject(projectId, 'translations'))) return plain();

  const translator = await loadTranslator(projectId, player.locale, tx);
  const data = { ...payload };
  const name = (field: string, entity: Parameters<typeof translator.t>[0], key: unknown) => {
    if (typeof data[field] === 'string' && (typeof key === 'string' || typeof key === 'number')) data[field] = translator.t(entity, key, 'name', data[field] as string);
  };
  name('achievementName', 'achievement', data['achievementKey']);
  name('challengeName', 'challenge', data['challengeKey']);
  name('levelName', 'level', data['newLevel']);
  name('currencyName', 'currency', data['currency']);

  const standard = generateNotificationText(type, data as never);
  const custom = translator.has('notification', type, 'title') || translator.has('notification', type, 'message');
  return {
    title: fillTemplate(translator.t('notification', type, 'title', standard.title), data),
    message: fillTemplate(translator.t('notification', type, 'message', standard.message), data),
    data,
    custom,
  };
}

/** A plain email from a notification's own title and message, for text a project translated itself. */
export function renderLocalizedEmail(title: string, message: string, appName = 'Gami') {
  const htmlBody = renderBaseHtmlLayout(escapeHtml(title), `<div class="title">${escapeHtml(title)}</div>\n<div class="body-content">${escapeHtml(message)}</div>`, appName);
  return { subject: title, htmlBody, textBody: `[${appName}] ${title}\n\n${message}` };
}
