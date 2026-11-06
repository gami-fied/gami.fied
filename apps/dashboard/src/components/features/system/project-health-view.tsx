'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Activity, Webhook, Layers, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { setVisibleInterval } from '@/lib/visible-interval';
import { PageHeader } from '@/components/ui/page-header';

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
      const res = await apiFetch(`/api/projects/${selectedProject.id}/system/metrics`);
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

    return setVisibleInterval(fetchMetrics, 5000);
  }, [selectedProject, fetchMetrics]);

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 border border-zinc-800 bg-zinc-950 my-8">
        Choose a project to see its delivery health.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Header */}
      <PageHeader
        title="Delivery Health"
        description={
          <>
            Real-time delivery status, outbox queues, webhook health, and channel integrations for
            project <span className="text-zinc-200">{selectedProject.name}</span>.
          </>
        }
        actions={
          <>
            <button
              onClick={() => {
                setLoading(true);
                fetchMetrics();
              }}
              className="shrink-0 flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs transition text-zinc-300 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Project Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Total events received</span>
            <Activity className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {(metrics?.eventsIngested ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">events</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Total raw events ingested and processed for {selectedProject.name}.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Webhook Delivery Success</span>
            <Webhook className="w-4 h-4 text-info-400" />
          </div>
          <div className="text-2xl font-bold text-success-400 tracking-tight">
            {(metrics?.webhookStats.delivered ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">delivered</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Successful HTTP webhook deliveries. Failed:{' '}
            {(metrics?.webhookStats.failed ?? 0).toLocaleString()}.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>External Integration Status</span>
            <Layers className="w-4 h-4 text-info-400" />
          </div>
          <div className="text-2xl font-bold text-info-400 tracking-tight">
            {(metrics?.integrationStats.delivered ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">channel messages</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Discord embed dispatches. Failed:{' '}
            {(metrics?.integrationStats.failed ?? 0).toLocaleString()}.
          </p>
        </div>
      </div>

      {/* Project Outboxes & Delivery Pipeline Table */}
      <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success-400" />
            Project Outbox Processing Queues
          </h2>
          <span className="text-xs text-zinc-400">Project Scoped Only</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-warning-400">
              {metrics?.outbox.eventOutboxPending ?? 0}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Pending Rules</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-info-400">
              {metrics?.outbox.challengeRewardOutboxPending ?? 0}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Pending Rewards</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-info-400">
              {metrics?.outbox.notificationOutboxPending ?? 0}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Pending In-App</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-success-400">
              {metrics?.outbox.emailNotificationOutboxPending ?? 0}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Pending Emails</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-lg font-black text-info-400">
              {metrics?.outbox.webhookOutboxPending ?? 0}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Pending Webhooks</div>
          </div>
        </div>

        {(metrics?.outbox.staleProcessingRecords ?? 0) > 0 && (
          <div className="p-3 bg-warning-950/40 border border-warning-800 text-warning-300 text-xs flex items-center justify-between">
            <span>
              Notice: {metrics?.outbox.staleProcessingRecords} records in processing status &gt; 5
              min.
            </span>
            <span className="text-xs font-bold text-warning-400">Retrying stuck deliveries</span>
          </div>
        )}
      </div>
    </div>
  );
}
