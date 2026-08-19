import {
  achievements,
  challengeRewardOutbox,
  challenges,
  emailNotificationOutbox,
  endUsers,
  eventOutbox,
  events,
  integrationDeliveries,
  levels,
  notificationOutbox,
  notifications,
  ruleExecutions,
  rules,
  userAchievements,
  userChallengeProgress,
  userXpBalances,
  webhookOutbox,
  xpLedger,
} from './schema/index.js';
import { and, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
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

export async function getExportCsvData(
  db: NodePgDatabase<Record<string, unknown>>,
  projectId: string,
  exportType: 'all' | 'overview' | 'users' | 'events' | 'xp' | 'achievements' | 'challenges' | 'rules' | 'notifications' | 'integrations' | string,
  options?: DateRangeOptions
): Promise<string> {
  const { start, end, preset } = resolveDateRange(options);
  const maxCap = 5000;

  const escapeCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const formatLine = (cells: unknown[]) => cells.map(escapeCell).join(',');

  const typeLower = (exportType || 'all').toLowerCase();

  // Tabular entity exports
  if (typeLower === 'users') {
    const headers = ['User ID', 'External ID', 'Name', 'Email', 'Active', 'Created At'];
    const userList = await db
      .select()
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), gte(endUsers.createdAt, start), lte(endUsers.createdAt, end)))
      .orderBy(desc(endUsers.createdAt))
      .limit(maxCap);

    const rows = userList.map((u) => [
      u.id,
      u.externalId,
      u.name || '',
      u.email || '',
      u.active ? 'true' : 'false',
      u.createdAt.toISOString(),
    ]);
    return [formatLine(headers), ...rows.map(formatLine)].join('\n');
  }

  if (typeLower === 'events') {
    const headers = ['Event ID', 'Event Type', 'User ID', 'Occurred At', 'Idempotency Key'];
    const eventList = await db
      .select()
      .from(events)
      .where(and(eq(events.projectId, projectId), gte(events.occurredAt, start), lte(events.occurredAt, end)))
      .orderBy(desc(events.occurredAt))
      .limit(maxCap);

    const rows = eventList.map((e) => [
      e.id,
      e.type,
      e.userId || '',
      e.occurredAt.toISOString(),
      e.idempotencyKey || '',
    ]);
    return [formatLine(headers), ...rows.map(formatLine)].join('\n');
  }

  if (typeLower === 'xp') {
    const headers = ['Ledger ID', 'User ID', 'Amount', 'Reason', 'Created At'];
    const xpList = await db
      .select()
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, start), lte(xpLedger.createdAt, end)))
      .orderBy(desc(xpLedger.createdAt))
      .limit(maxCap);

    const rows = xpList.map((x) => [x.id, x.userId, x.amount, x.reason, x.createdAt.toISOString()]);
    return [formatLine(headers), ...rows.map(formatLine)].join('\n');
  }

  if (typeLower === 'achievements') {
    const headers = ['Achievement ID', 'Achievement Name', 'User ID', 'Awarded At'];
    const achList = await db
      .select({
        id: userAchievements.id,
        name: achievements.name,
        userId: userAchievements.userId,
        awardedAt: userAchievements.awardedAt,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(and(eq(userAchievements.projectId, projectId), gte(userAchievements.awardedAt, start), lte(userAchievements.awardedAt, end)))
      .orderBy(desc(userAchievements.awardedAt))
      .limit(maxCap);

    const rows = achList.map((a) => [a.id, a.name, a.userId, a.awardedAt.toISOString()]);
    return [formatLine(headers), ...rows.map(formatLine)].join('\n');
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
