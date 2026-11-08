import crypto from 'crypto';
import { createLogger } from '@gami/config';
import {
  db,
  emailNotificationOutbox,
  endUsers,
  getPlatformSettings,
  lifecycleCampaigns,
  lifecycleSends,
  notificationPreferences,
  projects,
  streakDefinitions,
  userAchievements,
  userStreaks,
  userXpBalances,
  xpLedger,
  type LifecycleCampaign,
} from '@gami/database';
import { expireLots } from '@gami/rewards';
import { closeEndedSeasons } from '@gami/leaderboards';
import { renderLifecycleEmail, type LifecycleKind } from '@gami/notifications';
import { periodIndex, streakStatus, type StreakCadence } from '@gami/progression';
import { getRedisConnection } from '@gami/queue';
import { and, eq, gt, gte, inArray, sql } from 'drizzle-orm';

const log = createLogger('Lifecycle');

const RUN_INTERVAL_MS = 10 * 60 * 1000;
const LOCK_KEY = 'lifecycle:run:lock';
const DAY_MS = 86_400_000;
/** Most emails one campaign queues in one pass, so a big project is spread over several. */
const BATCH_LIMIT = 500;

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;

interface Recipient {
  userId: string;
  email: string;
  name: string | null;
  /** Identifies the day, week or spell of inactivity, so the same person is not emailed twice for it. */
  period: string;
  values: Record<string, string>;
}

const format = (value: number) => Math.round(value).toLocaleString('en-US');

/** Local hour (0 to 23) in a time zone. */
function localHour(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(at);
    return Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  } catch {
    return at.getUTCHours();
  }
}

/** People whose opt-out must be respected, from unsubscribing or from turning email off. */
async function optedOut(projectId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.projectId, projectId),
        eq(notificationPreferences.channel, 'email'),
        eq(notificationPreferences.enabled, false),
        inArray(notificationPreferences.userId, userIds)
      )
    );
  return new Set(rows.map((row) => row.userId));
}

async function xpTotals(projectId: string, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: userXpBalances.userId, total: userXpBalances.totalXp })
    .from(userXpBalances)
    .where(and(eq(userXpBalances.projectId, projectId), inArray(userXpBalances.userId, userIds)));
  return new Map(rows.map((row) => [row.userId, row.total]));
}

async function streakReminderRecipients(campaign: LifecycleCampaign, now: Date): Promise<Recipient[]> {
  const config = campaign.config as { streak?: string; sendAfterHour?: number };
  if (!config.streak) return [];

  const [definition] = await db
    .select()
    .from(streakDefinitions)
    .where(
      and(
        eq(streakDefinitions.projectId, campaign.projectId),
        eq(streakDefinitions.key, config.streak),
        eq(streakDefinitions.enabled, true)
      )
    );
  if (!definition) return [];

  const cadence = definition.cadence as StreakCadence;
  const recent = new Date(now.getTime() - (cadence === 'weekly' ? 16 : 3) * DAY_MS);
  const rows = await db
    .select({ streak: userStreaks, email: endUsers.email, name: endUsers.name })
    .from(userStreaks)
    .innerJoin(endUsers, eq(endUsers.id, userStreaks.userId))
    .where(
      and(
        eq(userStreaks.projectId, campaign.projectId),
        eq(userStreaks.definitionId, definition.id),
        gt(userStreaks.current, 0),
        gte(userStreaks.lastActivityAt, recent),
        eq(endUsers.active, true),
        sql`${endUsers.email} LIKE '%@%'`
      )
    )
    .limit(BATCH_LIMIT * 4);

  const settings = {
    cadence,
    timeZone: definition.timeZone,
    freezeEvery: definition.freezeEvery,
    maxFreezes: definition.maxFreezes,
  };
  const sendAfter = config.sendAfterHour ?? 18;
  const recipients: Recipient[] = [];

  for (const { streak, email, name } of rows) {
    const zone = streak.timeZone ?? definition.timeZone;
    const status = streakStatus(
      { current: streak.current, longest: streak.longest, lastPeriod: streak.lastPeriod, freezes: streak.freezes },
      now,
      settings,
      zone
    );
    // Only people who still can keep it, who have not yet done it this period, and for whom it is late enough.
    if (!status.alive || !status.atRisk || status.current === 0) continue;
    if (localHour(now, zone) < sendAfter) continue;

    recipients.push({
      userId: streak.userId,
      email: email as string,
      name,
      period: `${cadence}:${periodIndex(now, zone, cadence)}`,
      values: {
        streak_name: definition.name,
        streak_days: String(status.current),
        streak_unit: cadence === 'weekly' ? 'week' : 'day',
      },
    });
  }
  return recipients;
}

async function weeklyRecapRecipients(campaign: LifecycleCampaign, now: Date): Promise<Recipient[]> {
  const config = campaign.config as { weekday?: number; hour?: number };
  const weekday = config.weekday ?? 0;
  const hour = config.hour ?? 9;

  // The recap is due from its scheduled moment this week until a day later.
  const mondayIndex = (now.getUTCDay() + 6) % 7;
  const scheduled = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayIndex + weekday, hour)
  );
  const lateBy = now.getTime() - scheduled.getTime();
  if (lateBy < 0 || lateBy >= DAY_MS) return [];

  const since = new Date(now.getTime() - 7 * DAY_MS);
  const active = await db
    .select({ userId: xpLedger.userId, xp: sql<number>`SUM(${xpLedger.amount})::int` })
    .from(xpLedger)
    .where(and(eq(xpLedger.projectId, campaign.projectId), gte(xpLedger.createdAt, since)))
    .groupBy(xpLedger.userId)
    .limit(BATCH_LIMIT * 4);
  if (active.length === 0) return [];

  const ids = active.map((row) => row.userId);
  const [people, awards, streakRows, totals] = await Promise.all([
    db
      .select({ id: endUsers.id, email: endUsers.email, name: endUsers.name })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, campaign.projectId),
          inArray(endUsers.id, ids),
          eq(endUsers.active, true),
          sql`${endUsers.email} LIKE '%@%'`
        )
      ),
    db
      .select({ userId: userAchievements.userId, total: sql<number>`COUNT(*)::int` })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.projectId, campaign.projectId),
          inArray(userAchievements.userId, ids),
          gte(userAchievements.awardedAt, since)
        )
      )
      .groupBy(userAchievements.userId),
    db
      .select({ userId: userStreaks.userId, best: sql<number>`MAX(${userStreaks.current})::int` })
      .from(userStreaks)
      .where(and(eq(userStreaks.projectId, campaign.projectId), inArray(userStreaks.userId, ids)))
      .groupBy(userStreaks.userId),
    xpTotals(campaign.projectId, ids),
  ]);

  const xpByUser = new Map(active.map((row) => [row.userId, row.xp]));
  const awardsByUser = new Map(awards.map((row) => [row.userId, row.total]));
  const bestByUser = new Map(streakRows.map((row) => [row.userId, row.best]));
  // The week is named by its Monday, so the recap goes once a week however often this runs.
  const period = `week:${scheduled.toISOString().slice(0, 10)}`;

  return people
    .filter((person) => (xpByUser.get(person.id) ?? 0) > 0)
    .map((person) => ({
      userId: person.id,
      email: person.email as string,
      name: person.name,
      period,
      values: {
        xp_week: format(xpByUser.get(person.id) ?? 0),
        achievements_week: String(awardsByUser.get(person.id) ?? 0),
        best_streak: String(bestByUser.get(person.id) ?? 0),
        xp_total: format(totals.get(person.id) ?? 0),
      },
    }));
}

async function winbackRecipients(campaign: LifecycleCampaign, now: Date): Promise<Recipient[]> {
  const config = campaign.config as { inactiveDays?: number; maxDays?: number };
  const inactiveDays = config.inactiveDays ?? 14;
  const maxDays = config.maxDays ?? 90;
  const quietSince = new Date(now.getTime() - inactiveDays * DAY_MS);
  const tooLong = new Date(now.getTime() - maxDays * DAY_MS);

  const lapsed = (await db.execute(sql`
    SELECT user_id AS "userId", MAX(occurred_at) AS "lastSeen"
    FROM events
    WHERE project_id = ${campaign.projectId} AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING MAX(occurred_at) < ${quietSince.toISOString()}::timestamptz
       AND MAX(occurred_at) >= ${tooLong.toISOString()}::timestamptz
    LIMIT ${BATCH_LIMIT * 4}
  `)) as unknown as { userId: string; lastSeen: Date | string }[];
  if (lapsed.length === 0) return [];

  const ids = lapsed.map((row) => row.userId);
  const [people, totals] = await Promise.all([
    db
      .select({ id: endUsers.id, email: endUsers.email, name: endUsers.name })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, campaign.projectId),
          inArray(endUsers.id, ids),
          eq(endUsers.active, true),
          sql`${endUsers.email} LIKE '%@%'`
        )
      ),
    xpTotals(campaign.projectId, ids),
  ]);
  const lastSeen = new Map(lapsed.map((row) => [row.userId, new Date(row.lastSeen)]));

  return people.map((person) => {
    const seen = lastSeen.get(person.id) as Date;
    return {
      userId: person.id,
      email: person.email as string,
      name: person.name,
      // One email per spell of inactivity: coming back and drifting away again starts a new one.
      period: `away:${seen.toISOString().slice(0, 10)}`,
      values: {
        days_away: String(Math.floor((now.getTime() - seen.getTime()) / DAY_MS)),
        xp_total: format(totals.get(person.id) ?? 0),
      },
    };
  });
}

const FINDERS: Record<LifecycleKind, (campaign: LifecycleCampaign, now: Date) => Promise<Recipient[]>> = {
  streak_reminder: streakReminderRecipients,
  weekly_recap: weeklyRecapRecipients,
  winback: winbackRecipients,
};

/**
 * Works out who a campaign is due for and queues one email each into the normal email outbox, so
 * delivery, retries and the unsubscribe link work like any other email. The unique row in
 * lifecycle_sends is claimed before an email is queued, so a repeat run or a second worker cannot
 * send the same email twice.
 */
export async function runCampaign(campaign: LifecycleCampaign, now: Date = new Date()): Promise<number> {
  const kind = campaign.kind as LifecycleKind;
  const find = FINDERS[kind];
  if (!find) return 0;

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, campaign.projectId));
  const candidates = await find(campaign, now);
  if (candidates.length === 0) return 0;

  const blocked = await optedOut(campaign.projectId, candidates.map((candidate) => candidate.userId));
  let queued = 0;

  for (const candidate of candidates) {
    if (queued >= BATCH_LIMIT) break;
    if (blocked.has(candidate.userId)) continue;

    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(lifecycleSends)
        .values({
          id: `lcs_${crypto.randomUUID()}`,
          projectId: campaign.projectId,
          campaignId: campaign.id,
          userId: candidate.userId,
          periodKey: candidate.period,
        })
        .onConflictDoNothing()
        .returning({ id: lifecycleSends.id });
      if (!claimed) return;

      const rendered = renderLifecycleEmail(
        { subject: campaign.subject, body: campaign.body },
        {
          name: candidate.name?.trim() || 'there',
          app_name: project?.name ?? 'our app',
          xp_total: '0',
          ...candidate.values,
        },
        project?.name
      );

      const outboxId = `eob_${crypto.randomUUID()}`;
      await tx.insert(emailNotificationOutbox).values({
        id: outboxId,
        projectId: campaign.projectId,
        userId: candidate.userId,
        recipientEmail: candidate.email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        status: 'pending',
      });
      await tx.update(lifecycleSends).set({ emailOutboxId: outboxId }).where(eq(lifecycleSends.id, claimed.id));
      queued++;
    });
  }

  return queued;
}

/** One pass over every enabled campaign. */
export async function runLifecycleCampaigns(now: Date = new Date()): Promise<Record<string, number>> {
  const { allowGlobalEmailNotifications } = await getPlatformSettings('registration');
  if (!allowGlobalEmailNotifications) return {};

  const campaigns = await db.select().from(lifecycleCampaigns).where(eq(lifecycleCampaigns.enabled, true));
  const queued: Record<string, number> = {};
  for (const campaign of campaigns) {
    try {
      const count = await runCampaign(campaign, now);
      if (count > 0) {
        queued[campaign.id] = count;
        log.info('Queued lifecycle emails', { campaignId: campaign.id, projectId: campaign.projectId, kind: campaign.kind, count });
      }
    } catch (err) {
      log.error('A lifecycle campaign failed', { campaignId: campaign.id, error: (err as Error).message });
    }
  }
  return queued;
}

async function tick(): Promise<void> {
  try {
    // With several workers, only the one holding this lock runs the pass.
    const acquired = await getRedisConnection().set(LOCK_KEY, '1', 'EX', Math.floor(RUN_INTERVAL_MS / 1000) - 30, 'NX');
    if (!acquired) return;
    await runLifecycleCampaigns();
    // Points whose time is up are written off, so wallet history shows what happened to them.
    const closed = await db.transaction((tx) => expireLots(tx));
    if (closed > 0) log.info('Expired wallet points', { lots: closed });
    // Seasons that have ended are scored, and players move up or down for the next one.
    const seasons = await closeEndedSeasons();
    if (seasons > 0) log.info('Closed league seasons', { seasons });
  } catch (err) {
    log.error('Lifecycle pass failed', { error: (err as Error).message });
  }
}

export function startLifecycle(): void {
  if (timer) return;
  const run = () => {
    const current = tick().finally(() => {
      if (running === current) running = null;
    });
    running = current;
  };
  // The first pass waits a minute, so a restart loop never hammers the database.
  timer = setInterval(run, RUN_INTERVAL_MS);
  setTimeout(run, 60_000).unref();
}

export async function stopLifecycle(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await running;
}

