import { renderBaseHtmlLayout } from './email/templates.js';
import type { RenderedEmailTemplate } from './email/types.js';

/** Emails the engine sends on its own schedule. */
export type LifecycleKind = 'streak_reminder' | 'weekly_recap' | 'winback';

export const LIFECYCLE_KINDS: LifecycleKind[] = ['streak_reminder', 'weekly_recap', 'winback'];

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

const COMMON: TemplateVariable[] = [
  { name: 'name', description: "The person's name, or \"there\" when we don't have one", example: 'Ada' },
  { name: 'app_name', description: 'The project name', example: 'Acme Learning' },
  { name: 'xp_total', description: 'Their XP in total', example: '1,250' },
];

/** The `{{variables}}` each kind of email can use. */
export const LIFECYCLE_VARIABLES: Record<LifecycleKind, TemplateVariable[]> = {
  streak_reminder: [
    ...COMMON,
    { name: 'streak_name', description: 'The streak at risk', example: 'Daily lesson' },
    { name: 'streak_days', description: 'How long the streak is now', example: '12' },
    { name: 'streak_unit', description: '"day" or "week", matching the streak', example: 'day' },
  ],
  weekly_recap: [
    ...COMMON,
    { name: 'xp_week', description: 'XP earned in the last 7 days', example: '340' },
    { name: 'achievements_week', description: 'Achievements earned in the last 7 days', example: '2' },
    { name: 'best_streak', description: 'Their longest running streak', example: '12' },
  ],
  winback: [...COMMON, { name: 'days_away', description: 'Days since they were last active', example: '21' }],
};

export interface CampaignDefaults {
  name: string;
  subject: string;
  body: string;
  config: Record<string, unknown>;
}

export const LIFECYCLE_DEFAULTS: Record<LifecycleKind, CampaignDefaults> = {
  streak_reminder: {
    name: 'Streak reminder',
    subject: 'Your {{streak_name}} streak is at risk',
    body: "Hi {{name}},\n\nYou're on a {{streak_days}} {{streak_unit}} streak. Do it once more today to keep it going.\n\nSee you in {{app_name}}!",
    config: { streak: '', sendAfterHour: 18 },
  },
  weekly_recap: {
    name: 'Weekly recap',
    subject: 'Your week in {{app_name}}',
    body: 'Hi {{name}},\n\nThis week you earned {{xp_week}} XP and {{achievements_week}} new achievement(s). Your best streak is {{best_streak}}.\n\nKeep it up!',
    config: { weekday: 0, hour: 9 },
  },
  winback: {
    name: 'We miss you',
    subject: 'We miss you, {{name}}',
    body: "Hi {{name}},\n\nIt's been {{days_away}} days since we last saw you in {{app_name}}. You have {{xp_total}} XP waiting. Come back and pick up where you left off.",
    config: { inactiveDays: 14, maxDays: 90 },
  },
};

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 5000;

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** The names used in `{{ }}` in some text. */
export function variablesIn(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(VARIABLE), (match) => match[1] as string)));
}

/** Plain-language problems with a subject and body, or an empty list when they are fine. */
export function validateLifecycleTemplate(kind: LifecycleKind, subject: string, body: string): string[] {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('The subject cannot be empty');
  if (subject.length > MAX_SUBJECT_LENGTH) errors.push(`The subject can be at most ${MAX_SUBJECT_LENGTH} characters`);
  if (!body.trim()) errors.push('The message cannot be empty');
  if (body.length > MAX_BODY_LENGTH) errors.push(`The message can be at most ${MAX_BODY_LENGTH} characters`);

  const allowed = new Set(LIFECYCLE_VARIABLES[kind].map((variable) => variable.name));
  const unknown = variablesIn(`${subject}\n${body}`).filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    errors.push(`Unknown ${unknown.length === 1 ? 'variable' : 'variables'}: ${unknown.map((name) => `{{${name}}}`).join(', ')}`);
  }
  return errors;
}

/** Checks the timing and targeting for a kind, and returns it cleaned up. */
export function validateLifecycleConfig(kind: LifecycleKind, raw: unknown): { config: Record<string, unknown> } | { error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const whole = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

  if (kind === 'streak_reminder') {
    const streak = input['streak'];
    const hour = input['sendAfterHour'] ?? 18;
    if (typeof streak !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(streak)) {
      return { error: 'Choose the streak to remind people about' };
    }
    if (!whole(hour, 0, 23)) return { error: 'The send time must be an hour from 0 to 23' };
    return { config: { streak, sendAfterHour: hour } };
  }

  if (kind === 'weekly_recap') {
    const weekday = input['weekday'] ?? 0;
    const hour = input['hour'] ?? 9;
    if (!whole(weekday, 0, 6)) return { error: 'The day must be 0 (Monday) to 6 (Sunday)' };
    if (!whole(hour, 0, 23)) return { error: 'The hour must be from 0 to 23' };
    return { config: { weekday, hour } };
  }

  const inactiveDays = input['inactiveDays'] ?? 14;
  const maxDays = input['maxDays'] ?? 90;
  if (!whole(inactiveDays, 1, 365)) return { error: 'Inactive days must be a whole number from 1 to 365' };
  if (!whole(maxDays, 1, 730) || (maxDays as number) <= (inactiveDays as number)) {
    return { error: 'Stop-after days must be more than the inactive days' };
  }
  return { config: { inactiveDays, maxDays } };
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Swaps `{{name}}` for its value. A name with no value is left as written, so a mistake is visible. */
export function interpolate(text: string, values: Record<string, string>, escape: (value: string) => string = (value) => value): string {
  return text.replace(VARIABLE, (whole, name: string) => (name in values ? escape(values[name] as string) : whole));
}

/** Turns a subject and plain-text body into an email, with every value escaped in the HTML. */
export function renderLifecycleEmail(
  template: { subject: string; body: string },
  values: Record<string, string>,
  appName = 'Gami'
): RenderedEmailTemplate {
  const subject = interpolate(template.subject, values).replace(/[\r\n]+/g, ' ').trim();
  const textBody = `${interpolate(template.body, values).trim()}\n\nSent by ${appName}.`;

  const paragraphs = template.body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${interpolate(escapeHtml(paragraph), mapValues(values, escapeHtml)).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const htmlBody = renderBaseHtmlLayout(escapeHtml(subject), `<div class="title">${escapeHtml(subject)}</div>\n<div class="body-content">\n${paragraphs}\n</div>`, escapeHtml(appName));
  return { subject, htmlBody, textBody };
}

function mapValues(values: Record<string, string>, fn: (value: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fn(value)]));
}

/** Example values for a preview. */
export function sampleValues(kind: LifecycleKind): Record<string, string> {
  return Object.fromEntries(LIFECYCLE_VARIABLES[kind].map((variable) => [variable.name, variable.example]));
}
