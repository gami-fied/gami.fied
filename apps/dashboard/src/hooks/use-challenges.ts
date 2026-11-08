'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { ChallengeDefinition } from '@gami/challenges';
import { hasCachedState, useCachedState } from './use-cached-state';

export interface ChallengeSummary {
  totalChallenges: number;
  enabledChallenges: number;
  activeChallenges: number;
  totalCompletedInstances: number;
  uniqueParticipatingUsers: number;
  completionRate: number;
  mostCompletedChallenges: Array<{
    id: string;
    key: string;
    name: string;
    completedCount: number;
  }>;
}

export interface UserChallengeProgressItem {
  challengeId: string;
  key: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  enabled: boolean;
  trigger: string;
  type?: 'counter' | 'steps';
  recurrence?: 'daily' | 'weekly' | null;
  periodEndsAt?: string | null;
  completions?: number;
  steps?: Array<{ name: string; event: string; done: boolean }> | null;
  target: number;
  progress: number;
  completed: boolean;
  completedAt: string | null;
  percent: number;
}

export interface UserChallengeResponse {
  userId: string;
  externalId: string;
  name: string | null;
  challenges: UserChallengeProgressItem[];
}

export function useChallenges(projectId: string | null) {
  const [challenges, setChallenges] = useCachedState<ChallengeDefinition[]>(`challenges:${projectId}`, []);
  const [loading, setLoading] = useState<boolean>(!hasCachedState(`challenges:${projectId}`));
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setChallenges([]);
      return;
    }

    setLoading(!hasCachedState(`challenges:${projectId}`));
    setError(null);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/challenges`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data: ChallengeDefinition[] = await res.json();
        setChallenges(data);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to fetch challenges');
      }
    } catch {
      setError('An error occurred while fetching challenges');
    } finally {
      setLoading(false);
    }
  }, [projectId, setChallenges]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  return {
    challenges,
    loading,
    error,
    refresh: fetchChallenges,
  };
}

export function useChallengeSummary(projectId: string | null) {
  const [summary, setSummary] = useCachedState<ChallengeSummary | null>(`challengeSummary:${projectId}`, null);
  const [loading, setLoading] = useState<boolean>(!hasCachedState(`challengeSummary:${projectId}`));
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setSummary(null);
      return;
    }

    setLoading(!hasCachedState(`challengeSummary:${projectId}`));
    setError(null);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/challenges/summary`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data: ChallengeSummary = await res.json();
        setSummary(data);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to fetch challenge summary');
      }
    } catch {
      setError('An error occurred while fetching challenge summary');
    } finally {
      setLoading(false);
    }
  }, [projectId, setSummary]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    refresh: fetchSummary,
  };
}

export function useUserChallenges(projectId: string | null, userId: string | null) {
  const [userChallenges, setUserChallenges] = useState<UserChallengeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserChallenges = useCallback(async () => {
    if (!projectId || !userId) {
      setUserChallenges(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/users/${encodeURIComponent(userId)}/challenges`,
        { credentials: 'include' }
      );

      if (res.ok) {
        const data: UserChallengeResponse = await res.json();
        setUserChallenges(data);
      } else {
        const err = await res.json();
        setError(err.message || 'User not found in project');
      }
    } catch {
      setError('An error occurred while fetching user challenges');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => {
    if (userId) {
      fetchUserChallenges();
    }
  }, [fetchUserChallenges, userId]);

  return {
    userChallenges,
    loading,
    error,
    lookup: fetchUserChallenges,
  };
}
