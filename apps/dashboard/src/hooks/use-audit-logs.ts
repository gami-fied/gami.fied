import { useCallback, useEffect, useState } from 'react';

export interface AuditLogItem {
  id: string;
  projectId: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UseAuditLogsFilter {
  action?: string;
  resourceType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

export function useAuditLogs(projectId: string | null, filters?: UseAuditLogsFilter) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (targetPage = page) => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          limit: '20',
          ...(filters?.action ? { action: filters.action } : {}),
          ...(filters?.resourceType ? { resourceType: filters.resourceType } : {}),
          ...(filters?.actorId ? { actorId: filters.actorId } : {}),
          ...(filters?.startDate ? { startDate: filters.startDate } : {}),
          ...(filters?.endDate ? { endDate: filters.endDate } : {}),
        });

        const res = await fetch(`/api/projects/${projectId}/audit-logs?${query}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.auditLogs || []);
          setPage(data.pagination.page);
          setTotalPages(data.pagination.totalPages);
          setTotal(data.pagination.total);
        } else {
          const err = await res.json();
          setError(err.message || 'Failed to fetch audit logs');
        }
      } catch {
        setError('Network error loading audit logs');
      } finally {
        setLoading(false);
      }
    },
    [projectId, page, filters?.action, filters?.resourceType, filters?.actorId, filters?.startDate, filters?.endDate]
  );

  useEffect(() => {
    if (projectId) {
      fetchLogs(1);
    }
  }, [projectId, fetchLogs]);

  return { logs, page, totalPages, total, loading, error, setPage, refresh: fetchLogs };
}
