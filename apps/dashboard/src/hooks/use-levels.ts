import { apiFetch } from '@/lib/api-client';
import { useState, useCallback } from 'react';
import { hasCachedState, useCachedState } from './use-cached-state';

export interface LevelRecord {
  id: string;
  projectId: string;
  level: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  enabled: boolean;
  requiredXp: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressionSummary {
  configuredLevelCount: number;
  maxConfiguredLevel: number;
  totalProjectXp: number;
  usersWithXp: number;
  usersAtMaxLevel: number;
  distribution: Array<{
    level: number;
    name: string;
    userCount: number;
  }>;
}

export interface UserProgress {
  projectId: string;
  userId: string;
  totalXp: number;
  level: {
    number: number;
    name: string;
    requiredXp: number;
  };
  nextLevel: {
    number: number;
    name: string;
    requiredXp: number;
  } | null;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export function useLevels(projectId: string | null) {
  const [levels, setLevels] = useCachedState<LevelRecord[]>(`levels:${projectId}`, []);
  const [summary, setSummary] = useCachedState<ProgressionSummary | null>(`levelSummary:${projectId}`, null);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLevelsData = useCallback(async () => {
    if (!projectId) return;
    setLoading(!hasCachedState(`levels:${projectId}`));
    setError(null);
    try {
      const [levelsRes, summaryRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/levels`),
        apiFetch(`/api/projects/${projectId}/progression/summary`),
      ]);

      if (levelsRes.ok) {
        setLevels(await levelsRes.json());
      }
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
    } catch {
      setError('Failed to load level progression data');
    } finally {
      setLoading(false);
    }
  }, [projectId, setLevels, setSummary]);

  const createLevel = async (data: {
    level: number;
    name: string;
    description?: string;
    iconUrl?: string;
    requiredXp: number;
    enabled?: boolean;
  }) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/levels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      await fetchLevelsData();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create level definition');
    }
  };

  const updateLevel = async (
    levelId: string,
    data: Partial<{
      level: number;
      name: string;
      description: string;
      iconUrl: string;
      requiredXp: number;
      enabled: boolean;
    }>
  ) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/levels/${levelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      await fetchLevelsData();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update level definition');
    }
  };

  const enableLevel = async (levelId: string) => {
    return await updateLevel(levelId, { enabled: true });
  };

  const disableLevel = async (levelId: string) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/levels/${levelId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await fetchLevelsData();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to disable level definition');
    }
  };

  const fetchUserProgress = async (userId: string) => {
    if (!projectId || !userId.trim()) return;
    try {
      const res = await apiFetch(`/api/projects/${projectId}/users/${userId.trim()}/progress`);
      if (res.ok) {
        setUserProgress(await res.json());
      } else {
        setUserProgress(null);
      }
    } catch {
      setUserProgress(null);
    }
  };

  return {
    levels,
    summary,
    userProgress,
    loading,
    error,
    fetchLevelsData,
    createLevel,
    updateLevel,
    enableLevel,
    disableLevel,
    fetchUserProgress,
  };
}
