import {
  achievements,
  db,
  userAchievementProgress,
  userAchievements,
} from '@gami/database';
import {
  describeProgress,
  isStreakCriteria,
  validateAchievementCriteria,
  type AchievementCriteria,
  type AchievementTier,
} from '@gami/rules';
import { and, eq, sql } from 'drizzle-orm';

export interface AchievementProgressEntry {
  achievementId: string;
  key: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  hidden: boolean;
  /** Whether the user has earned at least the first tier. */
  earned: boolean;
  awardedAt: Date | null;
  /** What it measures, in words a player can read. */
  measures: string;
  /** Highest tier reached. 0 is none yet. */
  tier: number;
  /** Tiers in total, counting the first. */
  tierCount: number;
  tierName: string | null;
  value: number;
  nextTarget: number | null;
  /** 0 to 1 toward the next target. */
  fraction: number;
  complete: boolean;
}

function describe(criteria: AchievementCriteria): string {
  if (isStreakCriteria(criteria)) return `Longest run of ${criteria.streak}`;
  const unit =
    criteria.metric === 'count' ? 'events' : criteria.metric === 'unique' ? `different ${criteria.field}` : `total of ${criteria.field}`;
  return `${criteria.event}: ${unit}`;
}

/**
 * Every enabled achievement that measures itself, with how far the user has come. Secret
 * achievements are left out unless the user has earned them or the caller is staff.
 */
export async function loadAchievementProgress(
  projectId: string,
  userId: string,
  options: { includeHidden: boolean }
): Promise<AchievementProgressEntry[]> {
  const [definitions, progressRows, awards] = await Promise.all([
    db
      .select()
      .from(achievements)
      .where(and(eq(achievements.projectId, projectId), eq(achievements.enabled, true), sql`${achievements.criteria} IS NOT NULL`))
      .orderBy(achievements.createdAt, achievements.id),
    db
      .select()
      .from(userAchievementProgress)
      .where(and(eq(userAchievementProgress.projectId, projectId), eq(userAchievementProgress.userId, userId))),
    db
      .select({ achievementId: userAchievements.achievementId, awardedAt: userAchievements.awardedAt })
      .from(userAchievements)
      .where(and(eq(userAchievements.projectId, projectId), eq(userAchievements.userId, userId))),
  ]);

  const progressById = new Map(progressRows.map((row) => [row.achievementId, row]));
  const awardedById = new Map(awards.map((row) => [row.achievementId, row.awardedAt]));
  const entries: AchievementProgressEntry[] = [];

  for (const definition of definitions) {
    let parsed: { criteria: AchievementCriteria; tiers: AchievementTier[] };
    try {
      parsed = validateAchievementCriteria(definition.criteria, definition.tiers ?? []);
    } catch {
      continue;
    }

    const awardedAt = awardedById.get(definition.id) ?? null;
    if (definition.hidden && !awardedAt && !options.includeHidden) continue;

    const row = progressById.get(definition.id);
    const tier = row?.tier ?? 0;
    const view = describeProgress(row?.value ?? 0, tier, parsed.criteria, parsed.tiers);

    entries.push({
      achievementId: definition.id,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      iconUrl: definition.iconUrl,
      hidden: definition.hidden,
      earned: Boolean(awardedAt) || tier > 0,
      awardedAt,
      measures: describe(parsed.criteria),
      tier,
      tierCount: parsed.tiers.length + 1,
      tierName: tier >= 2 ? (parsed.tiers[tier - 2]?.name ?? null) : null,
      value: view.value,
      nextTarget: view.nextTarget,
      fraction: view.fraction,
      complete: view.complete,
    });
  }

  return entries;
}
