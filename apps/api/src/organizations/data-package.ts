/**
 * What an organization export holds, and how one is read back in.
 *
 * Both are driven by the schema: an export saves every project-scoped table on the list below, and
 * an import gives every row a new ID and rewrites each reference to match. A new table only needs
 * a line in one of the two lists, and a test fails until it has one.
 */
import crypto from 'crypto';
import { validateChallengeInput } from '@gami/challenges';
import {
  db,
  projects,
  reviveRow,
  rowsPerInsert,
  ruleExecutions,
  rules,
  schemaTables,
  userXpBalances,
  xpLedger,
  type SchemaTable,
} from '@gami/database';
import { validateSegmentFilter } from '@gami/leaderboards';
import { validateLevelDefinitions } from '@gami/progression';
import { validateRuleForSave } from '@gami/rules';
import { and, eq, getTableColumns, inArray, notExists, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export const EXPORT_FORMAT = 'gami-organization-export';
/** Version 1 held ten tables under their own names. Version 2 holds every table below under `tables`. */
export const EXPORT_VERSION = 2;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = Record<string, unknown>;
export type TableRows = Record<string, Row[]>;

/** The tables an export saves and an import reads: a project's design and its players' data. */
export const ORG_EXPORT_TABLES = [
  'projects',
  'endUsers',
  'events',
  'rules',
  'ruleVersions',
  'ruleExecutions',
  'xpLedger',
  'userXpBalances',
  'levels',
  'achievements',
  'userAchievements',
  'userAchievementProgress',
  'challenges',
  'userChallengeProgress',
  'challengeEventProgress',
  'notifications',
  'notificationPreferences',
  'streakDefinitions',
  'userStreaks',
  'streakHistory',
  'lifecycleCampaigns',
  'lifecycleSends',
  'xpBoosts',
  'xpLimits',
  'xpLimitHits',
  'abuseSettings',
  'abuseFlags',
  'currencies',
  'walletLots',
  'walletEntries',
  'rewards',
  'rewardCodes',
  'redemptions',
  'segments',
  'leagues',
  'leagueSeasons',
  'leagueMembers',
  'friendships',
  'friendRequests',
  'kudos',
  'referralPrograms',
  'referralCodes',
  'referrals',
  'lootBoxes',
  'lootBoxOpens',
  'seasonPasses',
  'seasonPassProgress',
  'teams',
  'teamMembers',
  'sharedGoals',
  'sharedGoalProgress',
  'sharedGoalContributions',
  'sharedGoalEvents',
  'cosmetics',
  'userCosmetics',
  'leaderboardPrizes',
  'leaderboardPayouts',
  'journeys',
  'journeyCompletions',
] as const;

const STAFF = 'Staff accounts and their access belong to the server, not to the data being moved.';
const SECRET = 'Holds a secret. It is set up again by hand on the new server.';
const QUEUE = 'Work waiting to be done or sent. Moving it would do it twice.';
const PLATFORM = 'Set by the platform administrator for this server.';

/** The tables an export leaves out, each with the reason. */
export const ORG_EXPORT_EXCLUDED: Record<string, string> = {
  organizations:
    'Only its name and slug are written, under `organization`. An import goes into an existing organization.',
  users: STAFF,
  account: STAFF,
  session: STAFF,
  verification: STAFF,
  member: STAFF,
  invitation: STAFF,
  projectMembers: STAFF,
  apiKeys: SECRET,
  connectors: SECRET,
  webhookEndpoints: `${SECRET} Listed under \`webhooks\` without it.`,
  webhookSubscriptions: 'Goes with the webhook endpoints.',
  integrations: `${SECRET} Listed under \`integrations\` without it.`,
  pushDevices: 'Device tokens only work with the push credentials, which are not moved.',
  eventOutbox: QUEUE,
  challengeRewardOutbox: QUEUE,
  notificationOutbox: QUEUE,
  emailNotificationOutbox: QUEUE,
  webhookOutbox: QUEUE,
  integrationDeliveries: QUEUE,
  auditLogs: 'The record of what staff did on this server stays with it.',
  featureSettings: PLATFORM,
  organizationPolicies: PLATFORM,
  serverConfigs: PLATFORM,
  platformBackups: PLATFORM,
};

/** Columns that hold another row's ID without a foreign key. They are rewritten like the rest. */
const SOFT_REFERENCES: Record<string, string[]> = {
  projects: ['promotesToProjectId'],
  redemptions: ['currencyId'],
  rewardCodes: ['redemptionId'],
  xpLimits: ['ruleId'],
  xpLimitHits: ['ruleId', 'eventId'],
  lifecycleSends: ['emailOutboxId'],
};

/**
 * Columns that usually hold another row's ID but only label where something came from. They are
 * rewritten when the row is in the file, and kept as they are otherwise.
 */
const SOURCE_LABELS: Record<string, string[]> = {
  notifications: ['sourceId'],
  // A team's ID, or `all` for a community goal.
  sharedGoalProgress: ['scopeKey'],
  sharedGoalContributions: ['scopeKey'],
  sharedGoalEvents: ['eventId'],
};

/** The export tables, parents first. */
export function exportTables(): SchemaTable[] {
  const wanted = new Set<string>(ORG_EXPORT_TABLES);
  return schemaTables().filter((table) => wanted.has(table.name));
}

/** Reads every exported table for an organization. */
export async function readOrganizationTables(organizationId: string): Promise<TableRows> {
  const orgProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  const projectIds = orgProjects.map((project) => project.id);
  const result: TableRows = {};

  for (const entry of exportTables()) {
    if (entry.name === 'projects') {
      result[entry.name] = orgProjects;
    } else if (projectIds.length === 0) {
      result[entry.name] = [];
    } else if (entry.name === 'ruleExecutions') {
      // The one exported table without a project column: it is reached through its rule.
      const ruleIds = db
        .select({ id: rules.id })
        .from(rules)
        .where(inArray(rules.projectId, projectIds));
      result[entry.name] = await db
        .select()
        .from(ruleExecutions)
        .where(inArray(ruleExecutions.ruleId, ruleIds));
    } else {
      const projectColumn = getTableColumns(entry.table)['projectId'] as PgColumn | undefined;
      if (!projectColumn) throw new Error(`Exported table ${entry.name} has no project column`);
      result[entry.name] = (await db
        .select()
        .from(entry.table)
        .where(inArray(projectColumn, projectIds))) as Row[];
    }
  }
  return result;
}

/** The names version 1 files used for the ten tables they held. */
const VERSION_1_KEYS: Record<string, string> = {
  projects: 'projects',
  users: 'endUsers',
  events: 'events',
  xpLedger: 'xpLedger',
  levels: 'levels',
  achievements: 'achievements',
  userAchievements: 'userAchievements',
  challenges: 'challenges',
  userChallengeProgress: 'userChallengeProgress',
  rules: 'rules',
};

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The tables in an uploaded file of either version, or null when it is not an export. */
export function readPackage(payload: unknown): { version: number; tables: TableRows } | null {
  if (!isRow(payload) || payload['format'] !== EXPORT_FORMAT) return null;
  const tables: TableRows = {};

  if (payload['version'] === 1) {
    for (const [key, name] of Object.entries(VERSION_1_KEYS)) {
      const rows = payload[key];
      if (Array.isArray(rows)) tables[name] = rows.filter(isRow);
    }
    // Version 1 called a level's threshold `minXp` in some releases.
    tables['levels'] = (tables['levels'] ?? []).map((level) => ({
      ...level,
      requiredXp: level['requiredXp'] ?? level['minXp'] ?? 0,
    }));
    return { version: 1, tables };
  }

  if (payload['version'] === EXPORT_VERSION && isRow(payload['tables'])) {
    for (const name of ORG_EXPORT_TABLES) {
      const rows = payload['tables'][name];
      if (Array.isArray(rows)) tables[name] = rows.filter(isRow);
    }
    return { version: EXPORT_VERSION, tables };
  }
  return null;
}

/**
 * Checks the parts of a file that are checked when saved through the dashboard. Anything that
 * would not be accepted there is left out of the import, with a warning that says why.
 */
export function dropInvalidDesign(tables: TableRows): string[] {
  const warnings: string[] = [];
  const keep = (name: string, check: (row: Row) => string | null, label: (row: Row) => string) => {
    tables[name] = (tables[name] ?? []).filter((row) => {
      const problem = check(row);
      if (problem) warnings.push(`${label(row)} is left out: ${problem}`);
      return !problem;
    });
  };
  const attempt = (work: () => void): string | null => {
    try {
      work();
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  keep(
    'rules',
    (row) =>
      attempt(() =>
        validateRuleForSave({
          trigger: row['trigger'],
          conditions: row['conditions'] ?? undefined,
          actions: row['actions'],
        })
      ),
    (row) => `Rule "${String(row['name'])}"`
  );
  keep(
    'challenges',
    (row) => {
      const result = validateChallengeInput(row);
      return result.valid ? null : result.errors.join(' ');
    },
    (row) => `Challenge "${String(row['key'])}"`
  );
  keep(
    'segments',
    (row) => attempt(() => validateSegmentFilter(row['filter'])),
    (row) => `Segment "${String(row['key'])}"`
  );

  // Levels are only valid as a set, so a project's levels are kept or left out together.
  const levelsByProject = new Map<unknown, Row[]>();
  for (const level of tables['levels'] ?? []) {
    levelsByProject.set(level['projectId'], [
      ...(levelsByProject.get(level['projectId']) ?? []),
      level,
    ]);
  }
  for (const [projectId, levels] of levelsByProject) {
    const result = attempt(() => {
      const checked = validateLevelDefinitions(levels as never);
      if (!checked.valid) throw new Error(checked.errors.join(' '));
    });
    if (result) {
      warnings.push(`The levels of project ${String(projectId)} are left out: ${result}`);
      tables['levels'] = (tables['levels'] ?? []).filter(
        (level) => level['projectId'] !== projectId
      );
    }
  }
  return warnings;
}

function newId(oldId: string): string {
  const prefix = /^([a-z]{2,8})_/.exec(oldId)?.[1] ?? 'imp';
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export interface ImportResult {
  /** Rows written, by table. */
  counts: Record<string, number>;
  /** Rows left out because something they point at was not in the file, by table. */
  skipped: Record<string, number>;
  projectIds: string[];
}

/**
 * Writes a file's tables into an organization, inside the caller's transaction.
 *
 * Every row gets a new ID, so a file can be imported next to the data it came from. Keys, players'
 * own IDs and everything else people and rules refer to stay exactly as they were. A reference is
 * only followed to a row in the same file, so a file cannot attach its rows to another
 * organization's data.
 */
export async function writeOrganizationTables(
  tx: Transaction,
  organizationId: string,
  tables: TableRows
): Promise<ImportResult> {
  const order = exportTables();
  const ids = new Map<string, string>();

  for (const entry of order) {
    if (!('id' in getTableColumns(entry.table))) continue;
    for (const row of tables[entry.name] ?? []) {
      if (typeof row['id'] === 'string' && row['id']) ids.set(row['id'], newId(row['id']));
    }
  }

  const takenSlugs = new Set(
    (
      await tx
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.organizationId, organizationId))
    ).map((row) => row.slug)
  );
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const projectIds: string[] = [];

  for (const entry of order) {
    const columns = getTableColumns(entry.table);
    const ready: Row[] = [];

    for (const source of tables[entry.name] ?? []) {
      const row = reviveRow(entry, source);
      const oldId = typeof source['id'] === 'string' ? source['id'] : null;
      let complete = true;

      if ('id' in columns) row['id'] = (oldId && ids.get(oldId)) || newId(entry.name);

      for (const reference of entry.references) {
        // The second half of a composite key repeats a column that is already rewritten.
        if (reference.foreignColumn !== 'id') continue;
        if (entry.name === 'projects' && reference.column === 'organizationId') continue;
        const value = row[reference.column];
        const mapped = typeof value === 'string' ? ids.get(value) : undefined;
        if (mapped) row[reference.column] = mapped;
        else if (reference.nullable) row[reference.column] = null;
        else complete = false;
      }
      for (const column of SOFT_REFERENCES[entry.name] ?? []) {
        const value = row[column];
        if (value === undefined || value === null) continue;
        const mapped = typeof value === 'string' ? ids.get(value) : undefined;
        if (mapped) row[column] = mapped;
        else if (columns[column]?.notNull) complete = false;
        else row[column] = null;
      }

      for (const column of SOURCE_LABELS[entry.name] ?? []) {
        const value = row[column];
        const mapped = typeof value === 'string' ? ids.get(value) : undefined;
        if (mapped) row[column] = mapped;
      }

      if (!complete) {
        // Rows that point at this one must be left out too.
        if (oldId) ids.delete(oldId);
        skipped[entry.name] = (skipped[entry.name] ?? 0) + 1;
        continue;
      }

      if (entry.name === 'projects') {
        row['organizationId'] = organizationId;
        const slug = String(row['slug'] ?? 'project');
        if (takenSlugs.has(slug)) {
          // The organization already has this project, so the copy is told apart from it.
          row['slug'] = `${slug}-imp-${crypto.randomBytes(4).toString('hex')}`;
          row['name'] = `${String(row['name'] ?? 'Project')} (Imported)`;
        }
        takenSlugs.add(String(row['slug']));
        projectIds.push(String(row['id']));
      }
      ready.push(row);
    }

    const first = ready[0];
    if (first) {
      const size = rowsPerInsert(first);
      for (let i = 0; i < ready.length; i += size) {
        await tx.insert(entry.table).values(ready.slice(i, i + size) as never[]);
      }
    }
    counts[entry.name] = ready.length;
  }

  // A player with XP history but no balance in the file (every version 1 file) gets one added up from it.
  if (projectIds.length > 0) {
    const added = await tx
      .insert(userXpBalances)
      .select(
        tx
          .select({
            id: sql<string>`'xpb_' || md5(${xpLedger.projectId} || ':' || ${xpLedger.userId} || ':' || clock_timestamp()::text)`.as(
              'id'
            ),
            projectId: xpLedger.projectId,
            userId: xpLedger.userId,
            totalXp: sql<number>`GREATEST(SUM(${xpLedger.amount}), 0)::bigint`.as('total_xp'),
            updatedAt: sql<Date>`now()`.as('updated_at'),
          })
          .from(xpLedger)
          .where(
            and(
              inArray(xpLedger.projectId, projectIds),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(userXpBalances)
                  .where(
                    and(
                      eq(userXpBalances.projectId, xpLedger.projectId),
                      eq(userXpBalances.userId, xpLedger.userId)
                    )
                  )
              )
            )
          )
          .groupBy(xpLedger.projectId, xpLedger.userId)
      )
      .returning({ id: userXpBalances.id });
    counts['userXpBalances'] = (counts['userXpBalances'] ?? 0) + added.length;
  }

  return { counts, skipped, projectIds };
}
