import { and, eq, inArray } from 'drizzle-orm';
import { db } from './client.js';
import { translations } from './schema/translations.js';

/** The kinds of thing whose text can be translated, with the fields each has. */
export const TRANSLATABLE = {
  achievement: ['name', 'description'],
  challenge: ['name', 'description'],
  level: ['name'],
  streak: ['name'],
  currency: ['name'],
  reward: ['name', 'description'],
  box: ['name', 'description'],
  box_item: ['name'],
  pass: ['name', 'description'],
  goal: ['name', 'description'],
  journey: ['name', 'description'],
  cosmetic: ['name', 'description'],
  team: ['name'],
  notification: ['title', 'message'],
} as const;

export type TranslatableType = keyof typeof TRANSLATABLE;

export const isTranslatableType = (value: string): value is TranslatableType => value in TRANSLATABLE;

/**
 * Tidies a language tag: `PT_br` becomes `pt-BR`. Returns null for anything that is not one, so
 * junk from a header or a query never reaches the database.
 */
export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replace(/_/g, '-');
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(tag)) return null;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

/** The first language in an `Accept-Language` header, such as `pt-BR,pt;q=0.9,en;q=0.8`. */
export function localeFromHeader(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const entry of ranked) {
    const locale = normalizeLocale(entry.tag);
    if (locale) return locale;
  }
  return null;
}

/** Where to look for a text, most exact first: `pt-BR` then `pt`. */
export function localeChain(locale: string): string[] {
  const parts = locale.split('-');
  const chain: string[] = [];
  for (let end = parts.length; end >= 1; end--) chain.push(parts.slice(0, end).join('-'));
  return chain;
}

export interface Translator {
  /** The language asked for, or null when there is none. */
  locale: string | null;
  /** The text in the player's language, or `fallback` when it has not been translated. */
  t: (type: TranslatableType, key: string | number, field: string, fallback: string) => string;
  /** As `t`, for text that may be missing. */
  tOptional: (type: TranslatableType, key: string | number, field: string, fallback: string | null) => string | null;
  /** Translates the `name` and `description` of something that has a `key`. */
  apply: <T extends { key: string; name: string; description?: string | null }>(type: TranslatableType, item: T) => T;
  /** True when the text exists in the player's language. */
  has: (type: TranslatableType, key: string | number, field: string) => boolean;
}

const slot = (type: string, key: string | number, field: string) => `${type}\u0000${key}\u0000${field}`;

function build(locale: string | null, texts: Map<string, string>): Translator {
  const t: Translator['t'] = (type, key, field, fallback) => texts.get(slot(type, key, field)) ?? fallback;
  return {
    locale,
    t,
    tOptional: (type, key, field, fallback) => texts.get(slot(type, key, field)) ?? fallback,
    has: (type, key, field) => texts.has(slot(type, key, field)),
    apply: (type, item) => {
      if (texts.size === 0) return item;
      const out = { ...item, name: t(type, item.key, 'name', item.name) };
      if ('description' in item) out.description = texts.get(slot(type, item.key, 'description')) ?? item.description;
      return out;
    },
  };
}

/** Changes nothing. Used when the player has no language, or the project has no translations. */
export const NO_TRANSLATION: Translator = build(null, new Map());

type Reader = Pick<typeof db, 'select'>;
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; translator: Translator }>();

/** Forgets what this process remembers for a project, after its translations change. */
export function forgetTranslations(projectId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${projectId}\u0000`)) cache.delete(key);
}

/**
 * Loads a project's texts for one language, falling back from `pt-BR` to `pt`. The result is kept
 * for 30 seconds, so a page of player requests reads the table once. Another API process may
 * therefore serve an old text for up to 30 seconds after a change.
 */
export async function loadTranslator(projectId: string, locale: string | null | undefined, reader: Reader = db): Promise<Translator> {
  const wanted = normalizeLocale(locale);
  if (!wanted) return NO_TRANSLATION;
  const cacheKey = `${projectId}\u0000${wanted}`;
  const cached = reader === db ? cache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.translator;

  const chain = localeChain(wanted);
  const rows = await reader
    .select({ locale: translations.locale, entityType: translations.entityType, entityKey: translations.entityKey, field: translations.field, value: translations.value })
    .from(translations)
    .where(and(eq(translations.projectId, projectId), inArray(translations.locale, chain)));

  const texts = new Map<string, string>();
  // The least exact language first, so a more exact one replaces it.
  for (const candidate of [...chain].reverse()) {
    for (const row of rows) if (row.locale === candidate) texts.set(slot(row.entityType, row.entityKey, row.field), row.value);
  }
  const translator = texts.size === 0 ? { ...NO_TRANSLATION, locale: wanted } : build(wanted, texts);
  if (reader === db) {
    if (cache.size > 500) cache.clear();
    cache.set(cacheKey, { at: Date.now(), translator });
  }
  return translator;
}

/** Fills `{{name}}` places in a template from `values`. An unknown name is left as it is. */
export function fillTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined || value === null || typeof value === 'object' ? whole : String(value);
  });
}
