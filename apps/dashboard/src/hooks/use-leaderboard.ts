'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { LeaderboardPeriod, LeaderboardResponse, UserRankResult } from '@gami/leaderboards';
import { hasCachedState, useCachedState } from './use-cached-state';

export function useLeaderboard(
  projectId: string | null,
  period: LeaderboardPeriod = 'all_time',
  page: number = 1,
  limit: number = 20,
  search: string = '',
  segment: string = ''
) {
  const cacheKey = `leaderboard:${projectId}:${period}:${page}:${limit}:${search}:${segment}`;
  const [data, setData] = useCachedState<LeaderboardResponse | null>(cacheKey, null);
  const [loading, setLoading] = useState<boolean>(!hasCachedState(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setData(null);
      return;
    }

    setLoading(!hasCachedState(cacheKey));
    setError(null);

    try {
      const params = new URLSearchParams({
        period,
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (segment) params.set('segment', segment);

      const res = await apiFetch(`/api/projects/${projectId}/leaderboard?${params.toString()}`, {
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
  }, [projectId, period, page, limit, search, segment, cacheKey, setData]);

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
      const res = await apiFetch(
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
  }, [projectId, userId, period, setData]);

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
