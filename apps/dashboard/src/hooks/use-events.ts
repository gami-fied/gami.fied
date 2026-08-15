import { useState, useCallback } from 'react';

export interface EventRecord {
  id: string;
  projectId: string;
  userId: string | null;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  occurredAt: string;
  createdAt: string;
}

export function useEvents(projectId: string | null) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchEvents = useCallback(
    async (currentPage = 1, typeFilter = '', userIdFilter = '') => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        let url = `/api/projects/${projectId}/events?page=${currentPage}&limit=15`;
        if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
        if (userIdFilter) url += `&userId=${encodeURIComponent(userIdFilter)}`;

        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setEvents(json.data || []);
          setPage(currentPage);
          setHasMore((json.data || []).length === 15);
        } else {
          const err = await res.json();
          setError(err.message || 'Failed to load events');
        }
      } catch {
        setError('Error connecting to API server');
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { events, loading, error, page, hasMore, fetchEvents };
}
