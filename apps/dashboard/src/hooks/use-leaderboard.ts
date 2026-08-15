'use client';

import { useState, useEffect, useCallback } from 'react';
import { LeaderboardPeriod, LeaderboardResponse, UserRankResult } from '@gami/leaderboards';

export function useLeaderboard(
  projectId: string | null,
  period: LeaderboardPeriod = 'all_time',
  page: number = 1,
  limit: number = 20,
  search: string = ''
) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        period,
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/projects/${projectId}/leaderboard?${params.toString()}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const result: LeaderboardResponse = await res.json();
        setData(result);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to fetch leaderboard');
      }
    } catch {
      setError('An error occurred while fetching leaderboard');
    } finally {
      setLoading(false);
    }
  }, [projectId, period, page, limit, search]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard: data,
    loading,
    error,
    refresh: fetchLeaderboard,
  };
}

export function useUserRank(
  projectId: string | null,
  userId: string | null,
  period: LeaderboardPeriod = 'all_time'
) {
  const [data, setData] = useState<UserRankResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserRank = useCallback(async () => {
    if (!projectId || !userId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/leaderboard/${encodeURIComponent(userId)}?period=${period}`,
        {
          credentials: 'include',
        }
      );

      if (res.ok) {
        const result: UserRankResult = await res.json();
        setData(result);
      } else {
        const err = await res.json();
        setError(err.message || 'User not found in leaderboard');
      }
    } catch {
      setError('An error occurred while looking up user rank');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, period]);

  useEffect(() => {
    if (userId) {
      fetchUserRank();
    }
  }, [fetchUserRank, userId, period]);

  return {
    userRank: data,
    loading,
    error,
    lookup: fetchUserRank,
  };
}
