'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '../context/dashboard-context';
import {
  Activity,
  Webhook,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderGit2,
  Mail,
} from 'lucide-react';

interface ProjectHealthMetrics {
  projectId: string;
  projectName: string;
  timestamp: string;
  eventsIngested: number;
  outbox: {
    eventOutboxPending: number;
    challengeRewardOutboxPending: number;
    notificationOutboxPending: number;
    emailNotificationOutboxPending: number;
    webhookOutboxPending: number;
    staleProcessingRecords: number;
  };
  webhookStats: {
    delivered: number;
    failed: number;
    pending: number;
  };
  integrationStats: {
    delivered: number;
    failed: number;
  };
}

export function ProjectHealthView() {
  const { selectedProject } = useDashboard();
  const [metrics, setMetrics] = useState<ProjectHealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/system/metrics`);
      if (res.ok) {
        setMetrics(await res.json());
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch project health metrics');
      }
    } catch {
      setError('Network error loading project delivery health');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    fetchMetrics();

    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [selectedProject, fetchMetrics]);

  if (!selectedProject) {
    return (
      <div className="p-8 text-center font-mono text-zinc-400 border border-zinc-800 bg-zinc-950 my-8">
        Please select a project to inspect delivery health &amp; operational pipelines.
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-zinc-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-orange-400" />
            <h1 className="text-xl font-bold uppercase tracking-wider text-white">
              Project Delivery Health
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time delivery status, outbox queues, webhook health, and channel integrations for project{' '}
            <span className="text-orange-400 font-bold">{selectedProject.name}</span>.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchMetrics();
          }}
          className="shrink-0 flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs uppercase tracking-wider transition text-zinc-300 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Pipeline
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Project Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>Total Events Ingested</span>
            <Activity className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {(metrics?.eventsIngested ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">events</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Total raw events ingested and processed for {selectedProject.name}.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>Webhook Delivery Success</span>
            <Webhook className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {(metrics?.webhookStats.delivered ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">delivered</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Successful HTTP webhook deliveries. Failed: {(metrics?.webhookStats.failed ?? 0).toLocaleString()}.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>External Integration Status</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 tracking-tight">
            {(metrics?.integrationStats.delivered ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">channel messages</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Discord embed dispatches. Failed: {(metrics?.integrationStats.failed ?? 0).toLocaleString()}.
          </p>
        </div>
      </div>

      {/* Project Outboxes & Delivery Pipeline Table */}
      <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Project Outbox Processing Queues
          </h2>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
            Project Scoped Only
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-amber-400">
              {metrics?.outbox.eventOutboxPending ?? 0}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase mt-1">Pending Rules</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-blue-400">
              {metrics?.outbox.challengeRewardOutboxPending ?? 0}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase mt-1">Pending Rewards</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-purple-400">
              {metrics?.outbox.notificationOutboxPending ?? 0}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase mt-1">Pending In-App</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-emerald-400">
              {metrics?.outbox.emailNotificationOutboxPending ?? 0}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase mt-1">Pending Emails</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-cyan-400">
              {metrics?.outbox.webhookOutboxPending ?? 0}
            </div>
            <div className="text-[10px] text-zinc-400 uppercase mt-1">Pending Webhooks</div>
          </div>
        </div>

        {(metrics?.outbox.staleProcessingRecords ?? 0) > 0 && (
          <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-300 text-xs flex items-center justify-between">
            <span>Notice: {metrics?.outbox.staleProcessingRecords} records in processing status &gt; 5 min.</span>
            <span className="text-[10px] uppercase font-bold text-amber-400">Outbox Recovery Active</span>
          </div>
        )}
      </div>
    </div>
  );
}
