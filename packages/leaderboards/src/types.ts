export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';

export interface LeaderboardOptions {
  period?: LeaderboardPeriod;
  page?: number;
  limit?: number;
  search?: string;
  now?: Date;
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
