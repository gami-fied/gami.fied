import { sql } from 'drizzle-orm';
import { db } from './client.js';

export interface MeasureAggregateInput {
  projectId: string;
  userId: string;
  metric: 'sum' | 'count' | 'unique';
  /** The event type to look at. */
  eventType: string;
  /** A payload path such as `payload.order.total`. Needed for `sum` and `unique`. */
  field?: string;
  start: Date | null;
  end: Date;
  excludeEventId?: string | null;
}

/** `payload.order.total` becomes the Postgres path `{order,total}`. */
function payloadPath(field: string): string {
  if (!/^payload(\.[A-Za-z0-9_-]+)+$/.test(field)) throw new Error('Invalid payload field');
  return `{${field.split('.').slice(1).join(',')}}`;
}

/** Totals one metric over a user's events. Only numbers are summed, so one badly typed event cannot break a total. */
export async function measureAggregate(input: MeasureAggregateInput): Promise<number> {
  const path = input.field ? payloadPath(input.field) : null;
  if (input.metric !== 'count' && !path) throw new Error('This metric needs a payload field');

  const select =
    input.metric === 'count'
      ? sql`COUNT(*)`
      : input.metric === 'unique'
        ? sql`COUNT(DISTINCT (payload #>> ${path}::text[]))`
        : sql`COALESCE(SUM((payload #>> ${path}::text[])::numeric) FILTER (WHERE (payload #>> ${path}::text[]) ~ '^-?[0-9]+(\\.[0-9]+)?$'), 0)`;

  const rows = (await db.execute(sql`
    SELECT ${select}::float8 AS value
    FROM events
    WHERE project_id = ${input.projectId}
      AND user_id = ${input.userId}
      AND type = ${input.eventType}
      AND occurred_at <= ${input.end.toISOString()}::timestamptz
      ${input.start ? sql`AND occurred_at >= ${input.start.toISOString()}::timestamptz` : sql``}
      ${input.excludeEventId ? sql`AND id <> ${input.excludeEventId}` : sql``}
  `)) as unknown as { value: string | number | null }[];

  return Number(rows[0]?.value ?? 0);
}
