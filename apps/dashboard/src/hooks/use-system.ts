import { useCallback, useEffect, useState } from 'react';

export interface SystemMetrics {
  projectId: string;
  timestamp: string;
  health: {
    api: string;
    postgres: string;
    redis: string;
    worker: string;
    workerAlive: boolean;
    workerHeartbeat: {
      workerId: string;
      timestamp: string;
      status: string;
      lastProcessedAt: string | null;
      processedCount: number;
    } | null;
  };
  outbox: {
    eventOutboxPending: number;
    challengeRewardOutboxPending: number;
    notificationOutboxPending: number;
    webhookOutboxPending: number;
    staleProcessingRecords: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  process: {
    eventsIngestedTotal: number;
    eventsProcessedTotal: number;
    eventsFailedTotal: number;
    rulesEvaluatedTotal: number;
    rulesMatchedTotal: number;
    ruleExecutionFailuresTotal: number;
    xpAwardedTotal: number;
    xpAdjustmentTotal: number;
    achievementsUnlockedTotal: number;
    challengesCompletedTotal: number;
    notificationsCreatedTotal: number;
    notificationsDeliveredTotal: number;
    notificationDeliveryFailuresTotal: number;
    webhookDeliveriesTotal: number;
    webhookDeliveriesSuccessTotal: number;
    webhookDeliveriesFailedTotal: number;
    httpRequestsTotal: number;
    httpErrorsTotal: number;
    httpRouteStats: Record<string, { requests: number; errors: number; totalDurationMs: number }>;
  };
}

export function useSystemMetrics(projectId: string | null, pollInterval = 5000) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/system/metrics`);
      if (res.ok) {
        setMetrics(await res.json());
        setError(null);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to fetch system metrics');
      }
    } catch {
      setError('Network error loading system metrics');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchMetrics();

    const interval = setInterval(fetchMetrics, pollInterval);
    return () => clearInterval(interval);
  }, [projectId, pollInterval, fetchMetrics]);

  return { metrics, loading, error, refresh: fetchMetrics };
}
