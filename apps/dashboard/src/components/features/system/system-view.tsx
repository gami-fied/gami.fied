'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState, useCallback } from 'react';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { RefreshCw } from 'lucide-react';
import { setVisibleInterval } from '@/lib/visible-interval';
import { PageHeader } from '@/components/ui/page-header';

interface PlatformMetrics {
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  health: {
    api: string;
    database: string;
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
  counts: {
    organizations: number;
    projects: number;
    endUsers: number;
    eventsIngested: number;
  };
  outboxes: {
    eventPending: number;
    emailPending: number;
    notificationPending: number;
    webhookPending: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  process: {
    httpRouteStats: Record<string, { requests: number; errors: number; totalDurationMs: number }>;
  };
}

export function SystemView() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/system');
      if (res.ok) {
        setMetrics(await res.json());
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch platform metrics');
      }
    } catch {
      setError('Network error fetching platform metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    return setVisibleInterval(fetchMetrics, 5000);
  }, [fetchMetrics]);

  const getStatusBadge = (status: string, isHealthy: boolean) => {
    return (
      <span
        className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-bold ${
          isHealthy
            ? 'border-success-700 bg-success-950/40 text-success-400'
            : 'border-danger-700 bg-danger-950/40 text-danger-400'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-none ${isHealthy ? 'bg-success-400 animate-pulse' : 'bg-danger-400'}`}
        />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Header */}
      <PageHeader
        title="Platform Health"
        description="Platform-wide PostgreSQL status, Redis health, BullMQ queue stats, worker heartbeats, and HTTP traffic latency."
        actions={
          <>
            <button
              onClick={() => {
                setLoading(true);
                fetchMetrics();
              }}
              className="shrink-0 flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs font-semibold transition text-zinc-300 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="border border-danger-800 bg-danger-950/40 p-4 text-xs text-danger-400">
          {error}
        </div>
      )}

      {/* System Health Probes */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* API Process */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-xs text-zinc-400 font-bold">API Process</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">Fastify API</span>
            {getStatusBadge(metrics?.health.api || 'checking', metrics?.health.api === 'healthy')}
          </div>
          <div className="text-[11px] text-zinc-400">Liveness probe: /health</div>
        </div>

        {/* PostgreSQL */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-xs text-zinc-400 font-bold">Database</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">PostgreSQL</span>
            {getStatusBadge(
              metrics?.health.postgres || 'checking',
              metrics?.health.postgres === 'healthy'
            )}
          </div>
          <div className="text-[11px] text-zinc-400">Readiness probe: SELECT 1</div>
        </div>

        {/* Redis */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-xs text-zinc-400 font-bold">Cache &amp; Queue</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">Redis</span>
            {getStatusBadge(
              metrics?.health.redis || 'checking',
              metrics?.health.redis === 'healthy'
            )}
          </div>
          <div className="text-[11px] text-zinc-400">Readiness probe: PING</div>
        </div>

        {/* Worker Heartbeat */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-xs text-zinc-400 font-bold">Background Worker</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">BullMQ Worker</span>
            {getStatusBadge(
              metrics?.health.worker || 'offline',
              metrics?.health.workerAlive === true
            )}
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            {metrics?.health.workerHeartbeat?.timestamp ? (
              <span>
                Last Heartbeat: {formatRelativeTime(metrics.health.workerHeartbeat.timestamp)}
              </span>
            ) : (
              <span className="text-warning-400">No active Redis heartbeat</span>
            )}
          </div>
        </div>
      </div>

      {/* Authoritative Outbox Queues & BullMQ Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outboxes Table */}
        <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold tracking-wide text-white">
              📦 Global Outbox Queues (PostgreSQL)
            </h2>
            <span className="text-xs text-zinc-400 italic">Database Computed</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-warning-400">
                {metrics?.outboxes.eventPending ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Events Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-info-400">
                {metrics?.outboxes.notificationPending ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Notifs Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-success-400">
                {metrics?.outboxes.emailPending ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Emails Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-info-400">
                {metrics?.outboxes.webhookPending ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Webhooks Pending</div>
            </div>
          </div>
        </div>

        {/* BullMQ Queues */}
        <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold tracking-wide text-white">
              ⚡ BullMQ Queue State (Redis)
            </h2>
            <span className="text-xs text-zinc-400 italic">Live Redis Pipeline</span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-warning-400">
                {metrics?.queue.waiting ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Waiting</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-success-400">
                {metrics?.queue.active ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Active</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-info-400">
                {metrics?.queue.completed ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Completed</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-info-400">{metrics?.queue.delayed ?? 0}</div>
              <div className="text-xs text-zinc-400 mt-1">Delayed</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-danger-400">
                {metrics?.queue.failed ?? 0}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Failed</div>
            </div>
          </div>

          {metrics?.health.workerHeartbeat && (
            <div className="border border-zinc-800 bg-zinc-900/40 p-3 text-xs space-y-1">
              <div className="flex justify-between text-zinc-400">
                <span>Worker Instance ID:</span>
                <span className="text-zinc-200 font-mono">
                  {metrics.health.workerHeartbeat.workerId}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Events Processed:</span>
                <span className="text-success-400 font-bold">
                  {metrics.health.workerHeartbeat.processedCount}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HTTP Request Metrics */}
      <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-bold tracking-wide text-white">
            🌐 Low-Cardinality HTTP Route Traffic
          </h2>
          <span className="text-xs text-zinc-400 italic">Requests &amp; Error Histogram</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs">
              <tr>
                <th className="px-3 py-2">HTTP Method &amp; Route</th>
                <th className="px-3 py-2 text-right">Total Requests</th>
                <th className="px-3 py-2 text-right">Errors (4xx / 5xx)</th>
                <th className="px-3 py-2 text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {metrics?.process.httpRouteStats &&
              Object.keys(metrics.process.httpRouteStats).length > 0 ? (
                Object.entries(metrics.process.httpRouteStats).map(([routeKey, stat]) => {
                  const avgLatency =
                    stat.requests > 0 ? Math.round(stat.totalDurationMs / stat.requests) : 0;
                  return (
                    <tr key={routeKey} className="hover:bg-zinc-900/40 font-mono">
                      <td className="px-3 py-2 font-semibold text-zinc-200">{routeKey}</td>
                      <td className="px-3 py-2 text-right font-bold text-success-400">
                        {stat.requests}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-danger-400">
                        {stat.errors}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">{avgLatency} ms</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                    No HTTP traffic recorded in current API process lifetime.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
