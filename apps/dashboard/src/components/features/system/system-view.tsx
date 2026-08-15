'use client';

import { useDashboard } from '../context/dashboard-context';
import { useSystemMetrics } from '@/hooks/use-system';
import { formatRelativeTime } from '@/hooks/use-relative-time';

export function SystemView() {
  const { selectedProject } = useDashboard();
  const { metrics, loading, error, refresh } = useSystemMetrics(selectedProject?.id || null);

  if (!selectedProject) {
    return (
      <div className="p-8 text-center font-mono text-zinc-400">
        Please select a project to view system health & observability metrics.
      </div>
    );
  }

  const getStatusBadge = (status: string, isHealthy: boolean) => {
    return (
      <span
        className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider font-mono ${
          isHealthy
            ? 'border-emerald-700 bg-emerald-950/40 text-emerald-400'
            : 'border-rose-700 bg-rose-950/40 text-rose-400'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-none ${isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 font-mono text-zinc-100">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">System Health & Observability</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time infrastructure health, worker Redis heartbeats, BullMQ metrics, and authoritative outbox queues for{' '}
            <span className="text-emerald-400">{selectedProject.name}</span>.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition"
        >
          ↻ Refresh Metrics
        </button>
      </div>

      {error && (
        <div className="border border-rose-800 bg-rose-950/40 p-4 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* System Health Probes */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* API Process */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">API Process</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">Fastify API</span>
            {getStatusBadge(metrics?.health.api || 'checking', metrics?.health.api === 'healthy')}
          </div>
          <div className="text-[11px] text-zinc-400">Liveness probe: /health</div>
        </div>

        {/* PostgreSQL */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Database</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">PostgreSQL</span>
            {getStatusBadge(metrics?.health.postgres || 'checking', metrics?.health.postgres === 'healthy')}
          </div>
          <div className="text-[11px] text-zinc-400">Readiness probe: SELECT 1</div>
        </div>

        {/* Redis */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Cache & Queue</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">Redis</span>
            {getStatusBadge(metrics?.health.redis || 'checking', metrics?.health.redis === 'healthy')}
          </div>
          <div className="text-[11px] text-zinc-400">Readiness probe: PING</div>
        </div>

        {/* Worker Heartbeat */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Background Worker</div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">BullMQ Worker</span>
            {getStatusBadge(
              metrics?.health.worker || 'offline',
              metrics?.health.workerAlive === true
            )}
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            {metrics?.health.workerHeartbeat?.timestamp ? (
              <span>Last Heartbeat: {formatRelativeTime(metrics.health.workerHeartbeat.timestamp)}</span>
            ) : (
              <span className="text-amber-400">No active Redis heartbeat</span>
            )}
          </div>
        </div>
      </div>

      {/* Authoritative Outbox Queues & BullMQ Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outboxes Table */}
        <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">
              📦 Authoritative Outbox Queues (PostgreSQL)
            </h2>
            <span className="text-[10px] text-zinc-500 italic">Database Computed</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-amber-400">
                {metrics?.outbox.eventOutboxPending ?? 0}
              </div>
              <div className="text-[10px] text-zinc-400 uppercase mt-1">Events Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-blue-400">
                {metrics?.outbox.challengeRewardOutboxPending ?? 0}
              </div>
              <div className="text-[10px] text-zinc-400 uppercase mt-1">Rewards Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-purple-400">
                {metrics?.outbox.notificationOutboxPending ?? 0}
              </div>
              <div className="text-[10px] text-zinc-400 uppercase mt-1">Notifs Pending</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-lg font-black text-emerald-400">
                {metrics?.outbox.webhookOutboxPending ?? 0}
              </div>
              <div className="text-[10px] text-zinc-400 uppercase mt-1">Webhooks Pending</div>
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/40 p-3 flex items-center justify-between">
            <span className="text-xs text-zinc-300">Stale Processing Records (&gt; 5 min):</span>
            <span className={`text-xs font-bold font-mono ${
              (metrics?.outbox.staleProcessingRecords ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {metrics?.outbox.staleProcessingRecords ?? 0} records
            </span>
          </div>
        </div>

        {/* BullMQ Queues */}
        <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">
              ⚡ BullMQ Queue State (Redis)
            </h2>
            <span className="text-[10px] text-zinc-500 italic">Live Redis Pipeline</span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-amber-400">{metrics?.queue.waiting ?? 0}</div>
              <div className="text-[9px] text-zinc-400 uppercase mt-1">Waiting</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-emerald-400">{metrics?.queue.active ?? 0}</div>
              <div className="text-[9px] text-zinc-400 uppercase mt-1">Active</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-blue-400">{metrics?.queue.completed ?? 0}</div>
              <div className="text-[9px] text-zinc-400 uppercase mt-1">Completed</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-purple-400">{metrics?.queue.delayed ?? 0}</div>
              <div className="text-[9px] text-zinc-400 uppercase mt-1">Delayed</div>
            </div>

            <div className="border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-base font-bold text-rose-400">{metrics?.queue.failed ?? 0}</div>
              <div className="text-[9px] text-zinc-400 uppercase mt-1">Failed</div>
            </div>
          </div>

          {metrics?.health.workerHeartbeat && (
            <div className="border border-zinc-800 bg-zinc-900/40 p-3 text-xs space-y-1">
              <div className="flex justify-between text-zinc-400">
                <span>Worker Instance ID:</span>
                <span className="text-zinc-200 font-mono">{metrics.health.workerHeartbeat.workerId}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Events Processed:</span>
                <span className="text-emerald-400 font-bold">{metrics.health.workerHeartbeat.processedCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HTTP Request Metrics (Low Cardinality) */}
      <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">
            🌐 Low-Cardinality HTTP Route Traffic
          </h2>
          <span className="text-[10px] text-zinc-500 italic">Requests &amp; Error Histogram</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 uppercase text-zinc-400 text-[10px]">
              <tr>
                <th className="px-3 py-2">HTTP Method &amp; Route</th>
                <th className="px-3 py-2 text-right">Total Requests</th>
                <th className="px-3 py-2 text-right">Errors (4xx / 5xx)</th>
                <th className="px-3 py-2 text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {metrics?.process.httpRouteStats && Object.keys(metrics.process.httpRouteStats).length > 0 ? (
                Object.entries(metrics.process.httpRouteStats).map(([routeKey, stat]) => {
                  const avgLatency = stat.requests > 0 ? Math.round(stat.totalDurationMs / stat.requests) : 0;
                  return (
                    <tr key={routeKey} className="hover:bg-zinc-900/40 font-mono">
                      <td className="px-3 py-2 font-semibold text-zinc-200">{routeKey}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400">{stat.requests}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-400">{stat.errors}</td>
                      <td className="px-3 py-2 text-right text-zinc-400">{avgLatency} ms</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
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
