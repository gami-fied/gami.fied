import { useState, useCallback } from 'react';

export interface AchievementRecord {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AchievementSummary {
  totalAchievements: number;
  enabledAchievements: number;
  totalAwards: number;
  uniqueUsersWithAchievements: number;
  mostAwardedAchievements: Array<{
    achievementId: string;
    key: string;
    name: string;
    awardCount: number;
  }>;
}

export interface UserAchievementAward {
  id: string;
  userId: string;
  achievementId: string;
  achievementKey: string;
  achievementName: string;
  achievementDescription: string | null;
  iconUrl: string | null;
  awardedAt: string;
}

export function useAchievements(projectId: string | null) {
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [userAwards, setUserAwards] = useState<UserAchievementAward[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAchievements = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/achievements`),
        fetch(`/api/projects/${projectId}/achievements/summary`),
      ]);

      if (listRes.ok) {
        const json = await listRes.json();
        setAchievements(json.data || []);
      }
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
    } catch {
      setError('Failed to load achievements');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const createAchievement = async (data: {
    key: string;
    name: string;
    description?: string;
    iconUrl?: string;
    enabled?: boolean;
  }) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/achievements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchAchievements();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create achievement');
    }
  };

  const updateAchievement = async (
    achievementId: string,
    data: Partial<{ name: string; description: string; iconUrl: string; enabled: boolean }>
  ) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/achievements/${achievementId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchAchievements();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update achievement');
    }
  };

  const disableAchievement = async (achievementId: string) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/achievements/${achievementId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await fetchAchievements();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to disable achievement');
    }
  };

  const fetchUserAchievements = async (userId: string) => {
    if (!projectId || !userId.trim()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/users/${userId.trim()}/achievements`);
      if (res.ok) {
        const json = await res.json();
        setUserAwards(json.data || []);
      } else {
        setUserAwards([]);
      }
    } catch {
      setUserAwards([]);
    }
  };

  return {
    achievements,
    summary,
    userAwards,
    loading,
    error,
    fetchAchievements,
    createAchievement,
    updateAchievement,
    disableAchievement,
    fetchUserAchievements,
  };
}
