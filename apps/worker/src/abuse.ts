import crypto from 'crypto';
import { abuseFlags, abuseSettings, db, endUsers, events, xpLedger } from '@gami/database';
import { and, count, eq, gte, sql } from 'drizzle-orm';

/**
 * Flags someone who earns XP or sends events much faster than the project expects. A flag never
 * blocks anything; it asks a person to look. With auto-hide on, the person also drops out of
 * rankings until the flag is reviewed. Each kind of flag is raised at most once an hour per person.
 */
export async function checkVelocity(projectId: string, userId: string, now: Date = new Date()): Promise<number> {
  const [settings] = await db.select().from(abuseSettings).where(eq(abuseSettings.projectId, projectId));
  if (!settings?.enabled || (!settings.xpPerHour && !settings.eventsPerHour)) return 0;
  const since = new Date(now.getTime() - 3_600_000);

  const checks: { kind: 'xp_velocity' | 'event_velocity'; threshold: number; observed: () => Promise<number> }[] = [];
  if (settings.xpPerHour) {
    checks.push({
      kind: 'xp_velocity',
      threshold: settings.xpPerHour,
      observed: async () => {
        const [row] = await db
          .select({ total: sql<number>`COALESCE(SUM(${xpLedger.amount}), 0)::int` })
          .from(xpLedger)
          .where(and(eq(xpLedger.projectId, projectId), eq(xpLedger.userId, userId), gte(xpLedger.createdAt, since), sql`${xpLedger.amount} > 0`));
        return row?.total ?? 0;
      },
    });
  }
  if (settings.eventsPerHour) {
    checks.push({
      kind: 'event_velocity',
      threshold: settings.eventsPerHour,
      observed: async () => {
        const [row] = await db.select({ total: count() }).from(events).where(and(eq(events.projectId, projectId), eq(events.userId, userId), gte(events.createdAt, since)));
        return row?.total ?? 0;
      },
    });
  }

  let raised = 0;
  for (const check of checks) {
    const observed = await check.observed();
    if (observed <= check.threshold) continue;
    const created = await db.transaction(async (tx) => {
      // One flag per person and kind per hour, even when events arrive in parallel.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`abuse:${userId}:${check.kind}`}))`);
      const [recent] = await tx
        .select({ id: abuseFlags.id })
        .from(abuseFlags)
        .where(and(eq(abuseFlags.userId, userId), eq(abuseFlags.kind, check.kind), gte(abuseFlags.createdAt, since)))
        .limit(1);
      if (recent) return false;
      await tx.insert(abuseFlags).values({
        id: `flg_${crypto.randomUUID()}`,
        projectId,
        userId,
        kind: check.kind,
        observed,
        threshold: check.threshold,
        autoHidden: settings.autoHide,
      });
      if (settings.autoHide) await tx.update(endUsers).set({ rankingHidden: true, updatedAt: new Date() }).where(eq(endUsers.id, userId));
      return true;
    });
    if (created) raised += 1;
  }
  return raised;
}
