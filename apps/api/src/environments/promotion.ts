import crypto from 'crypto';
import {
  achievements,
  challenges,
  currencies,
  db,
  leagues,
  levels,
  rewards,
  rules,
  segments,
  streakDefinitions,
  xpBoosts,
  xpLimits,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { recordVersion } from '../rules/versions.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = Record<string, unknown> & { id: string };

/**
 * Everything that makes up a project's game design, in the order it must be copied: what other
 * things refer to comes first. Player data (users, XP, purchases) is never copied.
 */
export const PROMOTABLE_KINDS = ['currencies', 'achievements', 'levels', 'streaks', 'segments', 'leagues', 'rules', 'challenges', 'boosts', 'limits', 'rewards'] as const;
export type PromotableKind = (typeof PROMOTABLE_KINDS)[number];

export interface PromotionItem {
  kind: PromotableKind;
  /** What the item is matched on in both projects: its key, its name, or its level number. */
  identity: string;
  name: string;
  status: 'new' | 'changed' | 'same' | 'only_in_target';
  /** Fields that differ, for a changed item. */
  changes?: string[];
}

interface Lookup {
  achievementKeyById: Map<string, string>;
  currencyKeyById: Map<string, string>;
  ruleNameById: Map<string, string>;
}

interface Kind {
  table: PgTable & { id: unknown; projectId: unknown };
  identity: (row: Row) => string;
  label: (row: Row) => string;
  /** The row with project-specific IDs replaced by keys, so two projects can be compared. */
  portable: (row: Row, lookup: Lookup) => Record<string, unknown>;
  /** The portable form turned back into values for the target project. */
  restore?: (portable: Record<string, unknown>, target: Lookup & { achievementIdByKey: Map<string, string>; currencyIdByKey: Map<string, string>; ruleIdByName: Map<string, string> }) => Record<string, unknown>;
}

const SKIP = new Set(['id', 'projectId', 'createdAt', 'updatedAt', 'draft']);
const strip = (row: Row) => Object.fromEntries(Object.entries(row).filter(([key]) => !SKIP.has(key)));

const KINDS: Record<PromotableKind, Kind> = {
  currencies: { table: currencies as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  achievements: { table: achievements as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  levels: { table: levels as never, identity: (row) => `level ${row['level']}`, label: (row) => String(row['name']), portable: strip },
  streaks: { table: streakDefinitions as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  segments: { table: segments as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  leagues: { table: leagues as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  rules: {
    table: rules as never,
    identity: (row) => String(row['name']),
    label: (row) => String(row['name']),
    portable: (row) => {
      const actions = (Array.isArray(row['actions']) ? row['actions'] : []) as { type: string; params?: Record<string, unknown> }[];
      // An achievement is named by key in both projects; its ID differs.
      const portableActions = actions.map((action) => {
        if (action.type !== 'award_achievement' || !action.params) return action;
        const params = { ...action.params };
        delete params['achievementId'];
        return { ...action, params };
      });
      return { ...strip(row), actions: portableActions };
    },
    restore: (portable, target) => {
      const actions = (portable['actions'] as { type: string; params?: Record<string, unknown> }[]).map((action) => {
        if (action.type !== 'award_achievement' || !action.params) return action;
        const id = target.achievementIdByKey.get(String(action.params['achievementKey']));
        return id ? { ...action, params: { ...action.params, achievementId: id } } : action;
      });
      return { ...portable, actions };
    },
  },
  challenges: { table: challenges as never, identity: (row) => String(row['key']), label: (row) => String(row['name']), portable: strip },
  boosts: { table: xpBoosts as never, identity: (row) => String(row['name']), label: (row) => String(row['name']), portable: strip },
  limits: {
    table: xpLimits as never,
    identity: (row) => String(row['name']),
    label: (row) => String(row['name']),
    portable: (row, lookup) => {
      const { ruleId, ...rest } = strip(row);
      return { ...rest, rule: ruleId ? (lookup.ruleNameById.get(String(ruleId)) ?? null) : null };
    },
    restore: ({ rule, ...rest }, target) => ({ ...rest, ruleId: rule ? (target.ruleIdByName.get(String(rule)) ?? null) : null }),
  },
  rewards: {
    table: rewards as never,
    identity: (row) => String(row['key']),
    label: (row) => String(row['name']),
    portable: (row, lookup) => {
      const { currencyId, ...rest } = strip(row);
      delete rest['stock'];
      // Stock is how many are left in that project, so it is not copied over a live count.
      return { ...rest, currency: lookup.currencyKeyById.get(String(currencyId)) ?? null };
    },
    restore: ({ currency, ...rest }, target) => ({ ...rest, currencyId: target.currencyIdByKey.get(String(currency)) }),
  },
};

async function rowsOf(handle: typeof db | Tx, kind: PromotableKind, projectId: string): Promise<Row[]> {
  const table = KINDS[kind].table as unknown as typeof rules;
  return (await handle.select().from(table).where(eq(table.projectId, projectId))) as unknown as Row[];
}

async function lookupFor(handle: typeof db | Tx, projectId: string) {
  const [ach, cur, rul] = await Promise.all([
    handle.select({ id: achievements.id, key: achievements.key }).from(achievements).where(eq(achievements.projectId, projectId)),
    handle.select({ id: currencies.id, key: currencies.key }).from(currencies).where(eq(currencies.projectId, projectId)),
    handle.select({ id: rules.id, name: rules.name }).from(rules).where(eq(rules.projectId, projectId)),
  ]);
  return {
    achievementKeyById: new Map(ach.map((row) => [row.id, row.key])),
    currencyKeyById: new Map(cur.map((row) => [row.id, row.key])),
    ruleNameById: new Map(rul.map((row) => [row.id, row.name])),
    achievementIdByKey: new Map(ach.map((row) => [row.key, row.id])),
    currencyIdByKey: new Map(cur.map((row) => [row.key, row.id])),
    ruleIdByName: new Map(rul.map((row) => [row.name, row.id])),
  };
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner) && !(inner instanceof Date)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner
  );

function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => canonical(a[key]) !== canonical(b[key])).sort();
}

/** What would change in the target if the source's design were promoted to it. */
export async function diffProjects(sourceId: string, targetId: string): Promise<PromotionItem[]> {
  const [sourceLookup, targetLookup] = await Promise.all([lookupFor(db, sourceId), lookupFor(db, targetId)]);
  const items: PromotionItem[] = [];
  for (const kind of PROMOTABLE_KINDS) {
    const spec = KINDS[kind];
    const [source, target] = await Promise.all([rowsOf(db, kind, sourceId), rowsOf(db, kind, targetId)]);
    const targetBy = new Map(target.map((row) => [spec.identity(row), row]));
    for (const row of source) {
      const identity = spec.identity(row);
      const existing = targetBy.get(identity);
      if (!existing) {
        items.push({ kind, identity, name: spec.label(row), status: 'new' });
        continue;
      }
      targetBy.delete(identity);
      const changes = changedFields(spec.portable(row, sourceLookup), spec.portable(existing, targetLookup));
      items.push({ kind, identity, name: spec.label(row), status: changes.length ? 'changed' : 'same', ...(changes.length ? { changes } : {}) });
    }
    for (const [identity, row] of targetBy) items.push({ kind, identity, name: spec.label(row), status: 'only_in_target' });
  }
  return items;
}

/**
 * Copies the chosen items from source to target in one transaction, so the target never runs a
 * half-promoted design. Items only in the target are left alone: promotion adds and updates, it never deletes.
 */
export async function promote(sourceId: string, targetId: string, selected: { kind: PromotableKind; identity: string }[] | null, actor: string | null) {
  const wanted = selected ? new Set(selected.map((item) => `${item.kind}:${item.identity}`)) : null;
  const sourceLookup = await lookupFor(db, sourceId);
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const kind of PROMOTABLE_KINDS) {
      const spec = KINDS[kind];
      const table = spec.table as unknown as typeof rules;
      // Read the target's IDs again for each kind, so references to things copied earlier resolve.
      const targetLookup = await lookupFor(tx, targetId);
      const [source, target] = await Promise.all([rowsOf(db, kind, sourceId), rowsOf(tx, kind, targetId)]);
      const targetBy = new Map(target.map((row) => [spec.identity(row), row]));

      for (const row of source) {
        const identity = spec.identity(row);
        if (wanted && !wanted.has(`${kind}:${identity}`)) continue;
        const portable = spec.portable(row, sourceLookup);
        const existing = targetBy.get(identity);
        if (existing && changedFields(portable, spec.portable(existing, targetLookup)).length === 0) continue;
        const values = spec.restore ? spec.restore(portable, targetLookup) : portable;
        if (kind === 'rewards' && !values['currencyId']) throw new Error(`The reward "${identity}" needs the currency "${String(portable['currency'])}" in the target. Promote it too.`);

        if (existing) {
          const [saved] = await tx.update(table).set({ ...values, updatedAt: new Date() } as never).where(eq(table.id, existing.id)).returning();
          if (kind === 'rules' && saved) await recordVersion(tx, saved as never, 'Promoted from another environment', actor);
          updated += 1;
        } else {
          const prefix = { currencies: 'cur', achievements: 'ach', levels: 'lvl', streaks: 'stk', segments: 'seg', leagues: 'lg', rules: 'rule', challenges: 'chl', boosts: 'bst', limits: 'lim', rewards: 'rwd' }[kind];
          const [saved] = await tx
            .insert(table)
            .values({ ...values, ...(kind === 'rewards' ? { stock: row['stock'] ?? null } : {}), id: `${prefix}_${crypto.randomUUID()}`, projectId: targetId } as never)
            .returning();
          if (kind === 'rules' && saved) await recordVersion(tx, saved as never, 'Promoted from another environment', actor);
          created += 1;
        }
      }
    }
  });
  return { created, updated };
}
