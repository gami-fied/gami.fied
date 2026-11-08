import type { SQL } from 'drizzle-orm';

export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';

export interface LeaderboardOptions {
  period?: LeaderboardPeriod;
  page?: number;
  limit?: number;
  search?: string;
  now?: Date;
  /** Only rank people matching this, a fragment over the end_users row aliased `eu`. See segments.ts. */
  filter?: SQL;
}

export interface GroupLeaderboardOptions {
  /** The field to group by, such as `metadata.team` or `metadata.country`. */
  groupBy: string;
  period?: LeaderboardPeriod;
  /** `total` adds everyone's XP. `average` divides by the members, so small teams can win. */
  score?: 'total' | 'average';
  limit?: number;
  filter?: SQL;
  now?: Date;
}

export interface GroupLeaderboardEntry {
  rank: number;
  group: string;
  xp: number;
  members: number;
}

export interface GroupLeaderboardResponse {
  period: LeaderboardPeriod;
  groupBy: string;
  score: 'total' | 'average';
  total: number;
  entries: GroupLeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  avatarUrl: string | null;
  xp: number;
  level?: number;
  levelName?: string;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  page: number;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

export interface UserRankResult {
  period: LeaderboardPeriod;
  rank: number | null;
  totalUsers: number;
  entry: LeaderboardEntry | null;
}
