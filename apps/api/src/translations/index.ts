import crypto from 'crypto';
import {
  achievements,
  challenges,
  cosmetics,
  currencies,
  db,
  forgetTranslations,
  journeys,
  levels,
  lootBoxes,
  normalizeLocale,
  rewards,
  seasonPasses,
  sharedGoals,
  streakDefinitions,
  teams,
  TRANSLATABLE,
  translations,
  type TranslatableType,
} from '@gami/database';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

/** One piece of text that can be translated, with what it says in the project's own language. */
export interface SourceText {
  type: TranslatableType;
  key: string;
  field: string;
  /** What players see when there is no translation. */
  source: string;
  /** A name for the thing, to show next to its key. */
  label: string;
  /** For a notification: the `{{names}}` its text may use. */
  placeholders?: string[];
}

/** The standard wording of each notification, and the values a translation may use. */
const NOTIFICATION_TEXT: Record<string, { title: string; message: string; placeholders: string[] }> = {
  xp_awarded: { title: 'XP Awarded', message: 'You earned {{amount}} XP!', placeholders: ['amount', 'reason', 'totalXp'] },
  achievement_unlocked: { title: 'Achievement Unlocked!', message: 'Achievement unlocked: {{achievementName}}', placeholders: ['achievementName', 'achievementKey'] },
  level_up: { title: 'Level Up!', message: 'Congratulations! You reached Level {{newLevel}} ({{levelName}}).', placeholders: ['newLevel', 'levelName', 'previousLevel'] },
  challenge_completed: { title: 'Challenge Completed!', message: 'Challenge completed: {{challengeName}}', placeholders: ['challengeName', 'challengeKey'] },
  points_expiring: { title: 'Points expiring soon', message: '{{amount}} {{currencyName}} expire on {{expiresAt}}. Spend them before then!', placeholders: ['amount', 'currencyName', 'currency', 'expiresAt'] },
  prize_won: { title: '{{title}}', message: 'You won {{prizes}}.', placeholders: ['title', 'prizes'] },
};

/** Every text in a project that a player can see and a translation can replace. */
export async function sourceTexts(projectId: string): Promise<SourceText[]> {
  const named = async (type: TranslatableType, table: { projectId: unknown; key: unknown; name: unknown }, hasDescription: boolean) => {
    // Every table here has `project_id`, `key`, `name` and, where asked for, `description`.
    const rows = (await db
      .select()
      .from(table as never)
      .where(eq(table.projectId as never, projectId))) as { key: string; name: string; description?: string | null }[];
    return rows.flatMap((row) => [
      { type, key: row.key, field: 'name', source: row.name, label: row.name },
      ...(hasDescription && row.description ? [{ type, key: row.key, field: 'description', source: row.description, label: row.name }] : []),
    ]);
  };

  const [basic, levelRows, boxRows] = await Promise.all([
    Promise.all([
      named('achievement', achievements, true),
      named('challenge', challenges, true),
      named('streak', streakDefinitions, false),
      named('currency', currencies, false),
      named('reward', rewards, true),
      named('box', lootBoxes, true),
      named('pass', seasonPasses, true),
      named('goal', sharedGoals, true),
      named('journey', journeys, true),
      named('cosmetic', cosmetics, true),
      named('team', teams, false),
    ]),
    db.select({ level: levels.level, name: levels.name }).from(levels).where(eq(levels.projectId, projectId)).orderBy(levels.level),
    db.select({ key: lootBoxes.key, name: lootBoxes.name, items: lootBoxes.items }).from(lootBoxes).where(eq(lootBoxes.projectId, projectId)),
  ]);

  return [
    ...basic.flat(),
    ...levelRows.map((row) => ({ type: 'level' as const, key: String(row.level), field: 'name', source: row.name, label: `Level ${row.level}` })),
    ...boxRows.flatMap((box) => ((box.items ?? []) as { id: string; name: string }[]).map((item) => ({ type: 'box_item' as const, key: `${box.key}.${item.id}`, field: 'name', source: item.name, label: `${box.name}: ${item.name}` }))),
    ...Object.entries(NOTIFICATION_TEXT).flatMap(([type, text]) => [
      { type: 'notification' as const, key: type, field: 'title', source: text.title, label: type, placeholders: text.placeholders },
      { type: 'notification' as const, key: type, field: 'message', source: text.message, label: type, placeholders: text.placeholders },
    ]),
  ];
}

const entrySchema = z
  .object({
    type: z.string(),
    key: z.string().min(1).max(160),
    field: z.string().min(1).max(32),
    /** An empty value removes the translation. */
    value: z.string().max(2000),
  })
  .refine((entry) => entry.type in TRANSLATABLE && (TRANSLATABLE[entry.type as TranslatableType] as readonly string[]).includes(entry.field), { message: 'That kind of text cannot be translated' });

const saveSchema = z.object({ locale: z.string(), entries: z.array(entrySchema).min(1).max(2000) });

const bad = (reply: { status: (code: number) => { send: (body: unknown) => unknown } }, message: string) => reply.status(400).send({ error: 'Bad Request', code: 'BAD_REQUEST', message });

export async function translationRoutes(fastify: FastifyInstance) {
  // The languages a project has, with how much of each is done, and the texts of one language.
  fastify.get<{ Params: { projectId: string }; Querystring: { locale?: string } }>('/api/projects/:projectId/translations', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const locale = request.query.locale ? normalizeLocale(request.query.locale) : null;
    if (request.query.locale && !locale) return bad(reply, 'That is not a language tag. Use one such as fr or pt-BR.');

    const [counts, source, rows] = await Promise.all([
      db
        .select({ locale: translations.locale, total: sql<number>`COUNT(*)::int` })
        .from(translations)
        .where(eq(translations.projectId, projectId))
        .groupBy(translations.locale)
        .orderBy(translations.locale),
      sourceTexts(projectId),
      locale
        ? db
            .select({ type: translations.entityType, key: translations.entityKey, field: translations.field, value: translations.value })
            .from(translations)
            .where(and(eq(translations.projectId, projectId), eq(translations.locale, locale)))
        : [],
    ]);
    return reply.send({ locales: counts.map((row) => ({ locale: row.locale, translated: row.total })), locale, source, data: rows });
  });

  // Saves texts for one language. An empty value removes that text, so the player sees the original again.
  fastify.put<{ Params: { projectId: string } }>('/api/projects/:projectId/translations', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = saveSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid translations');
    const locale = normalizeLocale(parsed.data.locale);
    if (!locale) return bad(reply, 'That is not a language tag. Use one such as fr or pt-BR.');

    let saved = 0;
    let removed = 0;
    await db.transaction(async (tx) => {
      for (const entry of parsed.data.entries) {
        const where = and(eq(translations.projectId, projectId), eq(translations.locale, locale), eq(translations.entityType, entry.type), eq(translations.entityKey, entry.key), eq(translations.field, entry.field));
        if (entry.value.trim() === '') {
          removed += (await tx.delete(translations).where(where).returning({ id: translations.id })).length;
          continue;
        }
        await tx
          .insert(translations)
          .values({ id: `trn_${crypto.randomUUID()}`, projectId, locale, entityType: entry.type, entityKey: entry.key, field: entry.field, value: entry.value })
          .onConflictDoUpdate({ target: [translations.projectId, translations.locale, translations.entityType, translations.entityKey, translations.field], set: { value: entry.value, updatedAt: new Date() } });
        saved++;
      }
    });
    forgetTranslations(projectId);
    return reply.send({ locale, saved, removed });
  });

  fastify.delete<{ Params: { projectId: string; locale: string } }>('/api/projects/:projectId/translations/:locale', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const locale = normalizeLocale(request.params.locale);
    if (!locale) return bad(reply, 'That is not a language tag.');
    const gone = await db
      .delete(translations)
      .where(and(eq(translations.projectId, projectId), eq(translations.locale, locale)))
      .returning({ id: translations.id });
    forgetTranslations(projectId);
    return reply.send({ locale, removed: gone.length });
  });
}
