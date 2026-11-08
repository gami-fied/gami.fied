import { userXpBalances } from '@gami/database';
import { sql, type SQL } from 'drizzle-orm';

/**
 * A segment picks people by what you know about them: their name, email, ID, when they joined,
 * their XP, or anything you stored in their metadata, such as `metadata.country` or `metadata.team`.
 */
export type SegmentOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'less_than';

export interface SegmentCondition {
  field: string;
  operator: SegmentOperator;
  value?: unknown;
}

export interface SegmentFilter {
  match: 'all' | 'any';
  conditions: SegmentCondition[];
}

export const SEGMENT_OPERATORS: SegmentOperator[] = ['equals', 'not_equals', 'in', 'not_in', 'contains', 'starts_with', 'exists', 'not_exists', 'greater_than', 'less_than'];
export const MAX_SEGMENT_CONDITIONS = 20;

const BUILT_IN_FIELDS = ['name', 'email', 'externalId', 'createdAt', 'totalXp'] as const;
const PATH_PART = /^[A-Za-z0-9_-]{1,64}$/;

/** The metadata path inside `metadata.a.b`, or null when the field is not a metadata field. */
function metadataPath(field: string): string[] | null {
  if (!field.startsWith('metadata.')) return null;
  const parts = field.slice('metadata.'.length).split('.');
  return parts.length > 0 && parts.length <= 5 && parts.every((part) => PATH_PART.test(part)) ? parts : null;
}

/** True when the field names something a segment can look at. */
export function isSegmentField(field: unknown): field is string {
  return typeof field === 'string' && ((BUILT_IN_FIELDS as readonly string[]).includes(field) || metadataPath(field) !== null);
}

/** Throws a readable error when a segment could never be evaluated. */
export function validateSegmentFilter(input: unknown): SegmentFilter {
  const filter = input as SegmentFilter;
  if (!filter || typeof filter !== 'object') throw new Error('A segment needs conditions');
  if (filter.match !== 'all' && filter.match !== 'any') throw new Error('match must be "all" or "any"');
  if (!Array.isArray(filter.conditions) || filter.conditions.length === 0) throw new Error('A segment needs at least one condition');
  if (filter.conditions.length > MAX_SEGMENT_CONDITIONS) throw new Error(`A segment can have at most ${MAX_SEGMENT_CONDITIONS} conditions`);
  for (const condition of filter.conditions) {
    if (!isSegmentField(condition?.field)) {
      throw new Error(`"${String(condition?.field)}" is not a field a segment can use. Use name, email, externalId, createdAt, totalXp or metadata.<key>`);
    }
    if (!SEGMENT_OPERATORS.includes(condition.operator)) throw new Error(`Unsupported operator: ${String(condition.operator)}`);
    if ((condition.operator === 'in' || condition.operator === 'not_in') && (!Array.isArray(condition.value) || condition.value.length === 0 || condition.value.length > 500)) {
      throw new Error(`"${condition.operator}" needs a list of 1 to 500 values`);
    }
    if (condition.operator === 'greater_than' || condition.operator === 'less_than') {
      const ok = condition.field === 'createdAt' ? !Number.isNaN(Date.parse(String(condition.value))) : Number.isFinite(Number(condition.value)) && condition.value !== '' && condition.value !== null;
      if (!ok) throw new Error(`"${condition.operator}" on ${condition.field} needs ${condition.field === 'createdAt' ? 'a date' : 'a number'}`);
    }
    if (!['exists', 'not_exists', 'in', 'not_in'].includes(condition.operator) && (condition.value === undefined || condition.value === null || typeof condition.value === 'object')) {
      throw new Error(`"${condition.operator}" on ${condition.field} needs a value`);
    }
  }
  return { match: filter.match, conditions: filter.conditions.map(({ field, operator, value }) => ({ field, operator, value })) };
}

/** The SQL text for a field, read from the end_users row aliased `eu`. */
function textOf(field: string): SQL {
  const path = metadataPath(field);
  if (path) return sql`(eu.metadata #>> ARRAY[${sql.join(path.map((part) => sql`${part}`), sql`, `)}]::text[])`;
  if (field === 'name') return sql`eu.name`;
  if (field === 'email') return sql`eu.email`;
  if (field === 'externalId') return sql`eu.external_id`;
  if (field === 'createdAt') return sql`eu.created_at::text`;
  return sql`(${totalXpOf()})::text`;
}

function totalXpOf(): SQL {
  return sql`COALESCE((SELECT sb.total_xp FROM ${userXpBalances} sb WHERE sb.project_id = eu.project_id AND sb.user_id = eu.id), 0)`;
}

/** A number for comparisons, or null when the stored value is not a number. */
function numberOf(field: string): SQL {
  if (field === 'totalXp') return totalXpOf();
  const text = textOf(field);
  return sql`(CASE WHEN ${text} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${text})::numeric END)`;
}

function conditionSql(condition: SegmentCondition): SQL {
  const { field, operator, value } = condition;
  const text = textOf(field);
  switch (operator) {
    case 'equals':
      return sql`${text} = ${String(value)}`;
    case 'not_equals':
      return sql`${text} IS DISTINCT FROM ${String(value)}`;
    case 'in':
      return sql`${text} IN (${sql.join((value as unknown[]).map((item) => sql`${String(item)}`), sql`, `)})`;
    case 'not_in':
      return sql`(${text} IS NULL OR ${text} NOT IN (${sql.join((value as unknown[]).map((item) => sql`${String(item)}`), sql`, `)}))`;
    case 'contains':
      return sql`${text} ILIKE ${`%${String(value).replace(/[\\%_]/g, '\\$&')}%`}`;
    case 'starts_with':
      return sql`${text} ILIKE ${`${String(value).replace(/[\\%_]/g, '\\$&')}%`}`;
    case 'exists':
      return sql`${text} IS NOT NULL`;
    case 'not_exists':
      return sql`${text} IS NULL`;
    case 'greater_than':
    case 'less_than': {
      const op = operator === 'greater_than' ? sql`>` : sql`<`;
      if (field === 'createdAt') return sql`eu.created_at ${op} ${new Date(String(value)).toISOString()}::timestamptz`;
      return sql`${numberOf(field)} ${op} ${Number(value)}`;
    }
  }
}

/** A WHERE fragment over `eu` (the end_users row) that keeps only the people in the segment. */
export function segmentWhere(filter: SegmentFilter): SQL {
  const parts = filter.conditions.map(conditionSql);
  return sql`(${sql.join(parts, filter.match === 'all' ? sql` AND ` : sql` OR `)})`;
}

/** Only these users, for example a player and their friends. */
export function usersWhere(userIds: string[]): SQL {
  if (userIds.length === 0) return sql`FALSE`;
  return sql`eu.id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`;
}

/** The SQL for a field's value, so boards can be grouped by it. Exported for group boards. */
export function groupValueOf(field: string): SQL {
  if (!isSegmentField(field) || field === 'totalXp' || field === 'createdAt') throw new Error(`Cannot group by ${field}`);
  return textOf(field);
}

