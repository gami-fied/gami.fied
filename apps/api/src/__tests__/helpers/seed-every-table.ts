import { db, schemaTables, type SchemaTable } from '@gami/database';
import { getTableColumns } from 'drizzle-orm';

type Row = Record<string, unknown>;

export interface SeededData {
  /** One row for each table, by the table's schema name. `endUsers` has a second player in `friend`. */
  rows: Record<string, Row>;
  friend: Row;
  organizationId: string;
  projectId: string;
  /** The first player, whose ID, external ID and email are all easy to search for. */
  player: { id: string; externalId: string; email: string; name: string };
}

/** Values the generic filler cannot guess: things that are validated, or point at a row without a foreign key. */
function overrides(name: string, suffix: string, rows: Record<string, Row>): Row {
  switch (name) {
    case 'endUsers':
      return {
        externalId: `ext-${suffix}`,
        email: `player-${suffix}@example.com`,
        name: `Player ${suffix}`,
        metadata: { country: 'NL' },
      };
    case 'rules':
      return {
        name: `Lesson reward ${suffix}`,
        trigger: 'lesson_completed',
        conditions: null,
        actions: [
          { type: 'award_xp', params: { amount: 10 } },
          { type: 'award_achievement', params: { achievementKey: `badge-${suffix}` } },
        ],
      };
    case 'achievements':
      return { key: `badge-${suffix}`, name: 'Badge' };
    case 'challenges':
      return {
        key: `quest-${suffix}`,
        name: 'Quest',
        trigger: 'lesson_completed',
        target: 3,
        rewards: [],
      };
    case 'levels':
      return { level: 1, name: 'One', requiredXp: 0 };
    case 'segments':
      return {
        key: `segment-${suffix}`,
        filter: {
          match: 'all',
          conditions: [{ field: 'metadata.country', operator: 'equals', value: 'NL' }],
        },
      };
    case 'redemptions':
      return { currencyId: rows['currencies']?.['id'] };
    case 'rewardCodes':
      return { redemptionId: `redemptions_${suffix}` };
    case 'kudos':
      return { message: `Well done ${suffix}` };
    case 'webhookOutbox':
      return { payload: { userId: rows['endUsers']?.['id'], externalUserId: `ext-${suffix}` } };
    case 'users':
      return { email: `staff-${suffix}@example.com` };
    default:
      return {};
  }
}

function fill(
  entry: SchemaTable,
  suffix: string,
  rows: Record<string, Row>,
  friend: Row | null,
  variant = ''
): Row {
  const row: Row = {};
  const seen = new Map<string, number>();

  for (const [property, column] of Object.entries(getTableColumns(entry.table))) {
    const reference = entry.references.find(
      (item) => item.column === property && item.foreignColumn === 'id'
    );
    if (reference) {
      // A second column pointing at players, such as a friend or a referee, gets the second player.
      const nth = seen.get(reference.table) ?? 0;
      seen.set(reference.table, nth + 1);
      const target =
        reference.table === 'endUsers' && nth > 0 && friend ? friend : rows[reference.table];
      row[property] = target?.['id'];
      continue;
    }
    if (property === 'id') {
      row[property] = `${entry.name}_${suffix}${variant}`;
      continue;
    }
    if (!column.notNull || column.hasDefault) continue;
    if (column.dataType === 'string') row[property] = `${property}-${suffix}${variant}`;
    else if (column.dataType === 'number' || column.dataType === 'bigint') row[property] = 1;
    else if (column.dataType === 'boolean') row[property] = true;
    else if (column.dataType === 'date') row[property] = new Date();
    else if (column.dataType === 'json') row[property] = {};
    else if (column.dataType === 'array') row[property] = [];
  }
  return row;
}

/**
 * Puts one row in every table of the schema, all belonging to one new organization, project and
 * player. Tests for backups, exports and erasure use it, so a table added later is covered by
 * them without anyone remembering to.
 */
export async function seedEveryTable(suffix: string): Promise<SeededData> {
  const rows: Record<string, Row> = {};
  let friend: Row | null = null;

  for (const entry of schemaTables()) {
    const row = { ...fill(entry, suffix, rows, friend), ...overrides(entry.name, suffix, rows) };
    await db.insert(entry.table).values(row as never);
    rows[entry.name] = row;

    if (entry.name === 'endUsers') {
      friend = {
        ...fill(entry, suffix, rows, null, '_friend'),
        externalId: `friend-${suffix}`,
        email: `friend-${suffix}@example.com`,
        name: 'Friend',
      };
      await db.insert(entry.table).values(friend as never);
    }
  }

  const player = rows['endUsers']!;
  return {
    rows,
    friend: friend!,
    organizationId: String(rows['organizations']!['id']),
    projectId: String(rows['projects']!['id']),
    player: {
      id: String(player['id']),
      externalId: String(player['externalId']),
      email: String(player['email']),
      name: String(player['name']),
    },
  };
}
