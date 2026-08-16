import { useCallback, useEffect, useState } from 'react';

export type NotificationChannel = 'in_app' | 'email';
export type NotificationType =
  | 'xp_awarded'
  | 'achievement_unlocked'
  | 'level_up'
  | 'challenge_completed';

export interface NotificationPreferenceItem {
  id?: string | null;
  projectId: string;
  userId: string;
  channel: NotificationChannel;
  notificationType: NotificationType;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function useNotificationPreferences(projectId: string | null, userId: string | null) {
  const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!projectId || !userId) {
      setPreferences([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/users/${userId}/notification-preferences`
      );
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences || []);
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to load notification preferences');
      }
    } catch {
      setError('Network error loading notification preferences');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = async (
    channel: NotificationChannel,
    notificationType: NotificationType,
    enabled: boolean
  ) => {
    if (!projectId || !userId) return false;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    // Optimistic UI update
    setPreferences((prev) =>
      prev.map((p) =>
        p.channel === channel && p.notificationType === notificationType ? { ...p, enabled } : p
      )
    );

    try {
      const res = await fetch(
        `/api/projects/${projectId}/users/${userId}/notification-preferences`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferences: [{ channel, notificationType, enabled }],
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPreferences((prev) => {
            const next = [...prev];
            for (const updatedItem of data.preferences) {
              const idx = next.findIndex(
                (p) =>
                  p.channel === updatedItem.channel &&
                  p.notificationType === updatedItem.notificationType
              );
              if (idx >= 0) {
                next[idx] = updatedItem;
              } else {
                next.push(updatedItem);
              }
            }
            return next;
          });
        }
        setSuccessMsg('Preference updated');
        setTimeout(() => setSuccessMsg(null), 3000);
        return true;
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to update preference');
        await fetchPreferences(); // Rollback on failure
        return false;
      }
    } catch {
      setError('Network error saving preference');
      await fetchPreferences(); // Rollback on failure
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    preferences,
    loading,
    saving,
    error,
    successMsg,
    updatePreference,
    refresh: fetchPreferences,
  };
}
