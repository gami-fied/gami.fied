import {
  achievements,
  endUsers,
  events,
  integrationDeliveries,
  notificationOutbox,
  notifications,
  ruleExecutions,
  rules,
  userAchievements,
  userChallengeProgress,
  webhookOutbox,
  xpLedger,
} from './schema/index.js';
import { and, count, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type DateRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom';

export interface DateRangeOptions {
  range?: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

export function resolveDateRange(options?: DateRangeOptions): { start: Date; end: Date; preset: DateRangePreset } {
  let end = options?.endDate ? new Date(options.endDate) : new Date();
  let start: Date;
  let preset: DateRangePreset = options?.range || '7d';

  if (options?.startDate && options?.endDate) {
    preset = 'custom';
    start = new Date(options.startDate);
  } else {
    switch (options?.range) {
      case '24h':
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
      default:
        preset = '7d';
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  // Safety caps
  if (isNaN(start.getTime())) start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (isNaN(end.getTime())) end = new Date();
  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  // Enforce max 90 day window cap for CSV export / queries
  const maxWindowMs = 90 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxWindowMs) {
    start = new Date(end.getTime() - maxWindowMs);
  }

  return { start, end, preset };
}

/** Spreadsheets run cells starting with these characters as formulas, so text is prefixed. */
function neutraliseFormula(val: unknown): string {
  const text = String(val ?? '');
  return typeof val === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export async function getOverviewAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [
    [totalUsersRow],
    [activeUsersRow],
    [eventsRow],
    [xpRow],
    [achievementsRow],
    [challengesRow],
  ] = await Promise.all([
    db.select({ count: count() }).from(endUsers).where(eq(endUsers.projectId, projectId)),
    db
      .select({ count: sql<number>`count(distinct ${events.userId})::int` })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end))),
    db
      .select({ count: count() })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end))),
    db
      .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, start), lte(xpLedger.createdAt, end))),
    db
      .select({ count: count() })
      .from(userAchievements)
      .where(and(eq(userAchievements.projectId, projectId), gte(userAchievements.awardedAt, start), lte(userAchievements.awardedAt, end))),
    db
      .select({ count: count() })
      .from(userChallengeProgress)
      .where(
        and(
          eq(userChallengeProgress.projectId, projectId),
          eq(userChallengeProgress.completed, true),
          gte(userChallengeProgress.completedAt, start),
          lte(userChallengeProgress.completedAt, end)
        )
      ),
  ]);

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    totalUsers: totalUsersRow?.count || 0,
    activeUsers: activeUsersRow?.count || 0,
    eventsProcessed: eventsRow?.count || 0,
    xpAwarded: xpRow?.total || 0,
    achievementsUnlocked: achievementsRow?.count || 0,
    challengesCompleted: challengesRow?.count || 0,
  };
}

export async function getUserAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [[totalUsersRow], [newUsersRow], [activeUsersRow], growthTrend] = await Promise.all([
    db.select({ count: count() }).from(endUsers).where(eq(endUsers.projectId, projectId)),
    db
      .select({ count: count() })
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), gte(endUsers.createdAt, start), lte(endUsers.createdAt, end))),
    db
      .select({ count: sql<number>`count(distinct ${events.userId})::int` })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end))),
    db
      .select({
        date: sql<string>`date_trunc('day', ${endUsers.createdAt})::text`,
        count: count(),
      })
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), gte(endUsers.createdAt, start), lte(endUsers.createdAt, end)))
      .groupBy(sql`date_trunc('day', ${endUsers.createdAt})`)
      .orderBy(sql`date_trunc('day', ${endUsers.createdAt})`),
  ]);

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    totalUsers: totalUsersRow?.count || 0,
    newUsers: newUsersRow?.count || 0,
    activeUsers: activeUsersRow?.count || 0,
    userGrowthOverTime: growthTrend.map((row) => ({
      date: row.date ? row.date.split('T')[0] : '',
      count: Number(row.count || 0),
    })),
  };
}

export async function getEventAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [[totalEventsRow], volumeOverTime, topEventTypes] = await Promise.all([
    db
      .select({ count: count() })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end))),
    db
      .select({
        date: sql<string>`date_trunc('day', ${events.occurredAt})::text`,
        count: count(),
      })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end)))
      .groupBy(sql`date_trunc('day', ${events.occurredAt})`)
      .orderBy(sql`date_trunc('day', ${events.occurredAt})`),
    db
      .select({
        type: events.type,
        count: count(),
      })
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end)))
      .groupBy(events.type)
      .orderBy(desc(count()))
      .limit(10),
  ]);

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    totalEvents: totalEventsRow?.count || 0,
    eventVolumeOverTime: volumeOverTime.map((row) => ({
      date: row.date ? row.date.split('T')[0] : '',
      count: Number(row.count || 0),
    })),
    topEventTypes: topEventTypes.map((row) => ({
      type: row.type,
      count: Number(row.count || 0),
    })),
  };
}

export async function getGamificationAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [
    [xpSumRow],
    [activeUsersCountRow],
    xpTrend,
    topAchievements,
    [challengeStatsRow],
    topRules,
  ] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, start), lte(xpLedger.createdAt, end))),
    db
      .select({ count: sql<number>`count(distinct ${xpLedger.userId})::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, start), lte(xpLedger.createdAt, end))),
    db
      .select({
        date: sql<string>`date_trunc('day', ${xpLedger.createdAt})::text`,
        totalXp: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int`,
      })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, start), lte(xpLedger.createdAt, end)))
      .groupBy(sql`date_trunc('day', ${xpLedger.createdAt})`)
      .orderBy(sql`date_trunc('day', ${xpLedger.createdAt})`),
    db
      .select({
        achievementId: achievements.id,
        name: achievements.name,
        count: count(),
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(and(eq(userAchievements.projectId, projectId), gte(userAchievements.awardedAt, start), lte(userAchievements.awardedAt, end)))
      .groupBy(achievements.id, achievements.name)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        started: count(),
        completed: sql<number>`count(case when ${userChallengeProgress.completed} = true then 1 end)::int`,
      })
      .from(userChallengeProgress)
      .where(and(eq(userChallengeProgress.projectId, projectId), gte(userChallengeProgress.createdAt, start), lte(userChallengeProgress.createdAt, end))),
    db
      .select({
        ruleId: rules.id,
        name: rules.name,
        trigger: rules.trigger,
        count: count(),
      })
      .from(ruleExecutions)
      .innerJoin(rules, eq(ruleExecutions.ruleId, rules.id))
      .where(and(eq(rules.projectId, projectId), gte(ruleExecutions.createdAt, start), lte(ruleExecutions.createdAt, end)))
      .groupBy(rules.id, rules.name, rules.trigger)
      .orderBy(desc(count()))
      .limit(10),
  ]);

  const totalXp = xpSumRow?.total || 0;
  const activeUsersCount = activeUsersCountRow?.count || 0;
  const avgXpPerUser = activeUsersCount > 0 ? Math.round(totalXp / activeUsersCount) : 0;
  const startedChallenges = challengeStatsRow?.started || 0;
  const completedChallenges = challengeStatsRow?.completed || 0;
  const challengeCompletionRate = startedChallenges > 0 ? Math.round((completedChallenges / startedChallenges) * 100) : 0;

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    totalXpAwarded: totalXp,
    avgXpPerUser,
    xpAwardedOverTime: xpTrend.map((row) => ({
      date: row.date ? row.date.split('T')[0] : '',
      totalXp: Number(row.totalXp || 0),
    })),
    topAchievements: topAchievements.map((row) => ({
      id: row.achievementId,
      name: row.name,
      unlockedCount: Number(row.count || 0),
    })),
    challenges: {
      started: startedChallenges,
      completed: completedChallenges,
      completionRatePercent: challengeCompletionRate,
    },
    topTriggeredRules: topRules.map((row) => ({
      id: row.ruleId,
      name: row.name,
      trigger: row.trigger,
      executionCount: Number(row.count || 0),
    })),
  };
}

export async function getNotificationAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [[inAppRow], [outboxPendingRow], [outboxCompletedRow], [outboxFailedRow]] = await Promise.all([
    db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), gte(notifications.createdAt, start), lte(notifications.createdAt, end))),
    db
      .select({ count: count() })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.projectId, projectId), eq(notificationOutbox.status, 'pending'))),
    db
      .select({ count: count() })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.projectId, projectId), eq(notificationOutbox.status, 'completed'))),
    db
      .select({ count: count() })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.projectId, projectId), eq(notificationOutbox.status, 'failed'))),
  ]);

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    inAppNotificationsGenerated: inAppRow?.count || 0,
    outbox: {
      pending: outboxPendingRow?.count || 0,
      completed: outboxCompletedRow?.count || 0,
      failed: outboxFailedRow?.count || 0,
    },
  };
}

export async function getIntegrationAnalytics(db: NodePgDatabase<Record<string, unknown>>, projectId: string, options?: DateRangeOptions) {
  const { start, end, preset } = resolveDateRange(options);

  const [[whDeliveredRow], [whFailedRow], [integDeliveredRow], [integFailedRow]] = await Promise.all([
    db
      .select({ count: count() })
      .from(webhookOutbox)
      .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'delivered'))),
    db
      .select({ count: count() })
      .from(webhookOutbox)
      .where(and(eq(webhookOutbox.projectId, projectId), eq(webhookOutbox.status, 'failed'))),
    db
      .select({ count: count() })
      .from(integrationDeliveries)
      .where(and(eq(integrationDeliveries.projectId, projectId), eq(integrationDeliveries.status, 'delivered'))),
    db
      .select({ count: count() })
      .from(integrationDeliveries)
      .where(and(eq(integrationDeliveries.projectId, projectId), eq(integrationDeliveries.status, 'failed'))),
  ]);

  return {
    projectId,
    dateRange: { preset, startDate: start.toISOString(), endDate: end.toISOString() },
    webhooks: {
      delivered: whDeliveredRow?.count || 0,
      failed: whFailedRow?.count || 0,
    },
    integrations: {
      delivered: integDeliveredRow?.count || 0,
      failed: integFailedRow?.count || 0,
    },
  };
}

const TABULAR_EXPORTS = ['users', 'events', 'xp', 'achievements'] as const;
type TabularExport = (typeof TABULAR_EXPORTS)[number];

export function isTabularExport(type: string): type is TabularExport {
  return (TABULAR_EXPORTS as readonly string[]).includes(type);
}

const EXPORT_BATCH_SIZE = 2000;
/** A hard stop so one request cannot read an unbounded table. */
export const EXPORT_STREAM_MAX_ROWS = 1_000_000;

const csvCell = (val: unknown) => `"${neutraliseFormula(val).replace(/"/g, '""')}"`;
const csvLine = (cells: unknown[]) => cells.map(csvCell).join(',');

type ExportCursor = { at: Date; id: string } | null;

/**
 * Yields a tabular export one batch at a time, so memory stays flat however many rows match.
 * Batches follow a keyset on (timestamp, id), which stays fast on deep pages where OFFSET would not.
 */
export async function* streamTabularCsv(
  db: NodePgDatabase<Record<string, unknown>>,
  projectId: string,
  type: TabularExport,
  options?: DateRangeOptions & { hideEmail?: boolean },
  maxRows: number = EXPORT_STREAM_MAX_ROWS
): AsyncGenerator<string> {
  const { start, end } = resolveDateRange(options);

  const headers: Record<TabularExport, string[]> = {
    users: ['User ID', 'External ID', 'Name', 'Email', 'Active', 'Created At'],
    events: ['Event ID', 'Event Type', 'User ID', 'Occurred At', 'Idempotency Key'],
    xp: ['Ledger ID', 'User ID', 'Amount', 'Reason', 'Created At'],
    achievements: ['Achievement ID', 'Achievement Name', 'User ID', 'Awarded At'],
  };
  yield `${csvLine(headers[type])}\n`;

  const before = (at: unknown, id: unknown, cursor: ExportCursor) =>
    cursor
      ? or(lt(at as never, cursor.at), and(eq(at as never, cursor.at), lt(id as never, cursor.id)))
      : undefined;

  let cursor: ExportCursor = null;
  let sent = 0;

  while (sent < maxRows) {
    const limit = Math.min(EXPORT_BATCH_SIZE, maxRows - sent);
    let rows: unknown[][] = [];
    let last: ExportCursor = null;

    if (type === 'users') {
      const page = await db
        .select()
        .from(endUsers)
        .where(
          and(
            eq(endUsers.projectId, projectId),
            gte(endUsers.createdAt, start),
            lte(endUsers.createdAt, end),
            before(endUsers.createdAt, endUsers.id, cursor)
          )
        )
        .orderBy(desc(endUsers.createdAt), desc(endUsers.id))
        .limit(limit);
      rows = page.map((u) => [
        u.id,
        u.externalId,
        u.name || '',
        options?.hideEmail ? '' : u.email || '',
        u.active ? 'true' : 'false',
        u.createdAt.toISOString(),
      ]);
      const tail = page.at(-1);
      last = tail ? { at: tail.createdAt, id: tail.id } : null;
    } else if (type === 'events') {
      const page = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, projectId),
            gte(events.occurredAt, start),
            lte(events.occurredAt, end),
            before(events.occurredAt, events.id, cursor)
          )
        )
        .orderBy(desc(events.occurredAt), desc(events.id))
        .limit(limit);
      rows = page.map((e) => [e.id, e.type, e.userId || '', e.occurredAt.toISOString(), e.idempotencyKey || '']);
      const tail = page.at(-1);
      last = tail ? { at: tail.occurredAt, id: tail.id } : null;
    } else if (type === 'xp') {
      const page = await db
        .select()
        .from(xpLedger)
        .where(
          and(
            eq(xpLedger.projectId, projectId),
            gte(xpLedger.createdAt, start),
            lte(xpLedger.createdAt, end),
            before(xpLedger.createdAt, xpLedger.id, cursor)
          )
        )
        .orderBy(desc(xpLedger.createdAt), desc(xpLedger.id))
        .limit(limit);
      rows = page.map((x) => [x.id, x.userId, x.amount, x.reason, x.createdAt.toISOString()]);
      const tail = page.at(-1);
      last = tail ? { at: tail.createdAt, id: tail.id } : null;
    } else {
      const page = await db
        .select({
          id: userAchievements.id,
          name: achievements.name,
          userId: userAchievements.userId,
          awardedAt: userAchievements.awardedAt,
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
        .where(
          and(
            eq(userAchievements.projectId, projectId),
            gte(userAchievements.awardedAt, start),
            lte(userAchievements.awardedAt, end),
            before(userAchievements.awardedAt, userAchievements.id, cursor)
          )
        )
        .orderBy(desc(userAchievements.awardedAt), desc(userAchievements.id))
        .limit(limit);
      rows = page.map((a) => [a.id, a.name, a.userId, a.awardedAt.toISOString()]);
      const tail = page.at(-1);
      last = tail ? { at: tail.awardedAt, id: tail.id } : null;
    }

    if (rows.length === 0) return;
    yield `${rows.map(csvLine).join('\n')}\n`;
    sent += rows.length;
    if (rows.length < limit || !last) return;
    cursor = last;
  }
}

export async function getExportCsvData(
  db: NodePgDatabase<Record<string, unknown>>,
  projectId: string,
  exportType: 'all' | 'overview' | 'users' | 'events' | 'xp' | 'achievements' | 'challenges' | 'rules' | 'notifications' | 'integrations' | string,
  options?: DateRangeOptions & { hideEmail?: boolean }
): Promise<string> {
  const { start, end, preset } = resolveDateRange(options);
  const maxCap = 5000;

  const escapeCell = (val: unknown) => `"${neutraliseFormula(val).replace(/"/g, '""')}"`;
  const formatLine = (cells: unknown[]) => cells.map(escapeCell).join(',');

  const typeLower = (exportType || 'all').toLowerCase();

  // Tabular entity exports are streamed in batches. This path caps them for callers that want a string.
  if (isTabularExport(typeLower)) {
    const lines: string[] = [];
    for await (const chunk of streamTabularCsv(db, projectId, typeLower, options, maxCap)) {
      lines.push(chunk.replace(/\n$/, ''));
    }
    return lines.join('\n');
  }

  // Comprehensive Structured Report Export (All Analytics Details)
  const [ov, u, e, g, n, i] = await Promise.all([
    getOverviewAnalytics(db, projectId, options),
    getUserAnalytics(db, projectId, options),
    getEventAnalytics(db, projectId, options),
    getGamificationAnalytics(db, projectId, options),
    getNotificationAnalytics(db, projectId, options),
    getIntegrationAnalytics(db, projectId, options),
  ]);

  const lines: string[] = [];

  // Report Header
  lines.push(formatLine(['Gami.Fied Community Edition — Comprehensive Project Analytics Report']));
  lines.push(formatLine(['Project ID', projectId]));
  lines.push(formatLine(['Date Range Preset', preset]));
  lines.push(formatLine(['Period Start', start.toISOString()]));
  lines.push(formatLine(['Period End', end.toISOString()]));
  lines.push(formatLine(['Report Generated At', new Date().toISOString()]));
  lines.push('');

  // Section 1: Overview Summary
  lines.push(formatLine(['--- SECTION 1: OVERVIEW METRICS SUMMARY ---']));
  lines.push(formatLine(['Metric Name', 'Value']));
  lines.push(formatLine(['Total Registered Users', ov.totalUsers]));
  lines.push(formatLine(['Active Users (Period)', ov.activeUsers]));
  lines.push(formatLine(['Events Ingested', ov.eventsProcessed]));
  lines.push(formatLine(['Total XP Awarded', ov.xpAwarded]));
  lines.push(formatLine(['Achievements Unlocked', ov.achievementsUnlocked]));
  lines.push(formatLine(['Challenges Completed', ov.challengesCompleted]));
  lines.push('');

  // Section 2: User Growth & Activity
  lines.push(formatLine(['--- SECTION 2: USER GROWTH & ACTIVITY ---']));
  lines.push(formatLine(['Metric Name', 'Value']));
  lines.push(formatLine(['Total Registered Users', u.totalUsers]));
  lines.push(formatLine(['New Users Created in Period', u.newUsers]));
  lines.push(formatLine(['Active Users in Period', u.activeUsers]));
  lines.push('');
  lines.push(formatLine(['Daily User Registration Trend']));
  lines.push(formatLine(['Date', 'New User Registrations']));
  if (u.userGrowthOverTime.length === 0) {
    lines.push(formatLine(['No registration data in period', 0]));
  } else {
    u.userGrowthOverTime.forEach((row) => lines.push(formatLine([row.date, row.count])));
  }
  lines.push('');

  // Section 3: Event Volume & Top Types
  lines.push(formatLine(['--- SECTION 3: EVENT VOLUME & TOP EVENT TYPES ---']));
  lines.push(formatLine(['Metric Name', 'Value']));
  lines.push(formatLine(['Total Ingested Events', e.totalEvents]));
  lines.push('');
  lines.push(formatLine(['Top Ingested Event Types']));
  lines.push(formatLine(['Event Type', 'Ingestion Count']));
  if (e.topEventTypes.length === 0) {
    lines.push(formatLine(['No event data in period', 0]));
  } else {
    e.topEventTypes.forEach((row) => lines.push(formatLine([row.type, row.count])));
  }
  lines.push('');

  // Section 4: Gamification Mechanics Insights
  lines.push(formatLine(['--- SECTION 4: GAMIFICATION MECHANICS INSIGHTS ---']));
  lines.push(formatLine(['Metric Name', 'Value']));
  lines.push(formatLine(['Total XP Awarded', g.totalXpAwarded]));
  lines.push(formatLine(['Average XP Per Active User', g.avgXpPerUser]));
  lines.push(formatLine(['Challenges Started', g.challenges.started]));
  lines.push(formatLine(['Challenges Completed', g.challenges.completed]));
  lines.push(formatLine(['Challenge Completion Rate (%)', `${g.challenges.completionRatePercent}%`]));
  lines.push('');
  lines.push(formatLine(['Top Unlocked Achievements']));
  lines.push(formatLine(['Achievement ID', 'Achievement Name', 'Unlocked Count']));
  if (g.topAchievements.length === 0) {
    lines.push(formatLine(['No achievements unlocked in period', '-', 0]));
  } else {
    g.topAchievements.forEach((row) => lines.push(formatLine([row.id, row.name, row.unlockedCount])));
  }
  lines.push('');
  lines.push(formatLine(['Most Triggered Gamification Rules']));
  lines.push(formatLine(['Rule ID', 'Rule Name', 'Trigger Event', 'Execution Count']));
  if (g.topTriggeredRules.length === 0) {
    lines.push(formatLine(['No rule executions in period', '-', '-', 0]));
  } else {
    g.topTriggeredRules.forEach((row) => lines.push(formatLine([row.id, row.name, row.trigger, row.executionCount])));
  }
  lines.push('');

  // Section 5: Delivery & Integrations Status
  lines.push(formatLine(['--- SECTION 5: DELIVERY & INTEGRATIONS METRICS ---']));
  lines.push(formatLine(['Metric Name', 'Value']));
  lines.push(formatLine(['In-App Notifications Generated', n.inAppNotificationsGenerated]));
  lines.push(formatLine(['Email Outbox Completed', n.outbox.completed]));
  lines.push(formatLine(['Email Outbox Failed', n.outbox.failed]));
  lines.push(formatLine(['Webhook Outbox Delivered', i.webhooks.delivered]));
  lines.push(formatLine(['Webhook Outbox Failed', i.webhooks.failed]));
  lines.push(formatLine(['External Integrations Delivered', i.integrations.delivered]));
  lines.push(formatLine(['External Integrations Failed', i.integrations.failed]));
  lines.push('');

  return lines.join('\n');
}
