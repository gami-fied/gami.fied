import { useState, useCallback, useEffect } from 'react';

export interface NotificationRecord {
  id: string;
  projectId: string;
  userId: string;
  type: 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed';
  title: string;
  message: string;
  data: Record<string, unknown>;
  sourceType: string;
  sourceId: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useNotifications(projectId: string | null, userId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!projectId || !userId) return;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/users/${userId}/notifications/unread-count`
      );
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.unreadCount || 0);
      }
    } catch {
      // Ignore count fetch errors
    }
  }, [projectId, userId]);

  const fetchNotifications = useCallback(
    async (currentPage = 1, unreadOnly = false) => {
      if (!projectId || !userId) return;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/projects/${projectId}/users/${userId}/notifications?page=${currentPage}&limit=20${
          unreadOnly ? '&unreadOnly=true' : ''
        }`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setNotifications(json.notifications || []);
          setPage(json.page || 1);
          setTotal(json.total || 0);
          setUnreadCount(json.unreadCount || 0);
        } else {
          const err = await res.json();
          setError(err.message || 'Failed to load notifications');
        }
      } catch {
        setError('Error connecting to API server');
      } finally {
        setLoading(false);
      }
    },
    [projectId, userId]
  );

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!projectId || !userId) return;
      try {
        const res = await fetch(
          `/api/projects/${projectId}/users/${userId}/notifications/${notificationId}/read`,
          { method: 'PATCH' }
        );
        if (res.ok) {
          const updated = await res.json();
          setNotifications((prev) =>
            prev.map((n) => (n.id === notificationId ? { ...n, readAt: updated.readAt } : n))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch {
        // Handle read error gracefully
      }
    },
    [projectId, userId]
  );

  const markAllAsRead = useCallback(async () => {
    if (!projectId || !userId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/users/${userId}/notifications/read-all`, {
        method: 'POST',
      });
      if (res.ok) {
        const nowStr = new Date().toISOString();
        setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || nowStr })));
        setUnreadCount(0);
      }
    } catch {
      // Handle read-all error gracefully
    }
  }, [projectId, userId]);

  // Initial and polling fetch for unread count
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    page,
    total,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
