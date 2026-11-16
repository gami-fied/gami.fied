import { getTableColumns, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.js';

/** One foreign key column and the table and column it points at. */
export interface TableReference {
  /** The property name of the column on this table, such as `userId`. */
  column: string;
  /** The schema name of the table it points at, such as `endUsers`. */
  table: string;
  /** The property name of the column it points at, usually `id`. */
  foreignColumn: string;
  nullable: boolean;
}

export interface SchemaTable {
  /** The name the table is exported under, such as `endUsers`. Backups and exports use it as the key. */
  name: string;
  /** The table's name in PostgreSQL, such as `end_users`. */
  sqlName: string;
  table: PgTable;
  /** Property names of the columns that hold a date, which JSON turns into text. */
  dateColumns: string[];
  references: TableReference[];
}

function describe(name: string, table: PgTable, nameBySqlName: Map<string, string>): SchemaTable {
  const config = getTableConfig(table);
  const columns = getTableColumns(table);
  const propertyOf = (owner: PgTable, sqlColumn: string) =>
    Object.entries(getTableColumns(owner)).find(([, column]) => column.name === sqlColumn)?.[0] ??
    sqlColumn;

  const references: TableReference[] = [];
  for (const key of config.foreignKeys) {
    const reference = key.reference();
    const target = nameBySqlName.get(getTableConfig(reference.foreignTable).name);
    if (!target) continue;
    reference.columns.forEach((column, index) => {
      const foreign = reference.foreignColumns[index];
      if (!foreign) return;
      const entry: TableReference = {
        column: propertyOf(table, column.name),
        table: target,
        foreignColumn: propertyOf(reference.foreignTable, foreign.name),
        nullable: !column.notNull,
      };
      // A composite key repeats columns that a single-column key already covers.
      if (!references.some((item) => item.column === entry.column && item.table === entry.table))
        references.push(entry);
    });
  }

  return {
    name,
    sqlName: config.name,
    table,
    dateColumns: Object.entries(columns)
      .filter(([, column]) => column.dataType === 'date')
      .map(([property]) => property),
    references,
  };
}

let cached: SchemaTable[] | null = null;

/**
 * Every table in the schema, parents before the tables that refer to them. Inserting in this
 * order, or deleting in the reverse, never breaks a foreign key. Backups, exports and their tests
 * read this list, so a new table cannot be forgotten.
 */
export function schemaTables(): SchemaTable[] {
  if (cached) return cached;

  const found = Object.entries(schema as Record<string, unknown>).filter(
    (entry): entry is [string, PgTable] => is(entry[1], PgTable)
  );
  const nameBySqlName = new Map(found.map(([name, table]) => [getTableConfig(table).name, name]));
  const pending = new Map(
    found.map(([name, table]) => [name, describe(name, table, nameBySqlName)])
  );

  const ordered: SchemaTable[] = [];
  const placed = new Set<string>();
  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter((item) =>
        item.references.every(
          (reference) => reference.table === item.name || placed.has(reference.table)
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    if (ready.length === 0) {
      throw new Error(`Tables refer to each other in a circle: ${[...pending.keys()].join(', ')}`);
    }
    for (const item of ready) {
      ordered.push(item);
      placed.add(item.name);
      pending.delete(item.name);
    }
  }

  cached = ordered;
  return ordered;
}

/** Turns the date columns of a row read from JSON back into dates, and drops unknown fields. */
export function reviveRow(
  table: SchemaTable,
  row: Record<string, unknown>
): Record<string, unknown> {
  const known = getTableColumns(table.table);
  const revived: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!(key in known)) continue;
    revived[key] =
      table.dateColumns.includes(key) && typeof value === 'string' ? new Date(value) : value;
  }
  return revived;
}

/** Rows per insert, kept under PostgreSQL's limit of 65,535 parameters in one statement. */
export function rowsPerInsert(row: Record<string, unknown>): number {
  return Math.max(1, Math.min(500, Math.floor(60_000 / Math.max(1, Object.keys(row).length))));
}
