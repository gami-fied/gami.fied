'use client';

import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { Server, Building2, Folder, Users, Activity, CheckCircle } from 'lucide-react';

interface SystemOverview {
  version?: string;
  environment?: string;
  health?: { database?: string; redis?: string; worker?: string };
  counts?: { organizations?: number; projects?: number; endUsers?: number; eventsIngested?: number };
  outboxes?: {
    eventPending?: number;
    emailPending?: number;
    notificationPending?: number;
    webhookPending?: number;
  };
}

export default function AdminOverviewPage() {
  const [systemData, setSystemData] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSystemData();
  }, []);

  const fetchSystemData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/system');
      if (res.ok) {
        setSystemData(await res.json());
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch platform system status');
      }
    } catch {
      setError('Network error fetching system status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-danger-400" />
          Platform System Overview
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Server-level operational health, database status, queue state, and tenant counts.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-danger-500 border-t-transparent rounded-full animate-spin" />
          Loading platform metrics...
        </div>
      ) : systemData ? (
        <>
          {/* Health Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-1">
              <div className="text-xs text-zinc-400 font-bold">PostgreSQL</div>
              <div className="text-sm font-bold flex items-center gap-2 text-success-400">
                <CheckCircle className="w-4 h-4" />
                {systemData.health?.database || 'Healthy'}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-1">
              <div className="text-xs text-zinc-400 font-bold">Redis Cache</div>
              <div className="text-sm font-bold flex items-center gap-2 text-success-400">
                <CheckCircle className="w-4 h-4" />
                {systemData.health?.redis || 'Healthy'}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-1">
              <div className="text-xs text-zinc-400 font-bold">Worker Process</div>
              <div className="text-sm font-bold flex items-center gap-2 text-success-400">
                <Activity className="w-4 h-4" />
                {systemData.health?.worker || 'Alive'}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-1">
              <div className="text-xs text-zinc-400 font-bold">API Version</div>
              <div className="text-sm font-bold text-zinc-200">
                v{systemData.version} ({systemData.environment})
              </div>
            </div>
          </div>

          {/* Core Platform Counts */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-950 border border-zinc-800 p-5 text-center">
              <Building2 className="w-5 h-5 text-danger-400 mx-auto mb-1" />
              <div className="text-2xl font-black text-danger-400">
                {systemData.counts?.organizations?.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Organizations
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-5 text-center">
              <Folder className="w-5 h-5 text-warning-400 mx-auto mb-1" />
              <div className="text-2xl font-black text-warning-400">
                {systemData.counts?.projects?.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Active Projects
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-5 text-center">
              <Users className="w-5 h-5 text-info-400 mx-auto mb-1" />
              <div className="text-2xl font-black text-info-400">
                {systemData.counts?.endUsers?.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Total End-Users
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-5 text-center">
              <Activity className="w-5 h-5 text-success-400 mx-auto mb-1" />
              <div className="text-2xl font-black text-success-400">
                {systemData.counts?.eventsIngested?.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Events Ingested
              </div>
            </div>
          </div>

          {/* Outbox Pending Status */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 space-y-4">
            <h2 className="text-sm font-bold text-white border-b border-zinc-800 pb-3">
              Outbox Backlog Monitoring
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="border border-zinc-800 p-3 bg-zinc-900/40">
                <div className="text-zinc-400 text-xs font-bold">Event Outbox</div>
                <div className="text-lg font-bold text-zinc-200">
                  {systemData.outboxes?.eventPending || 0} pending
                </div>
              </div>
              <div className="border border-zinc-800 p-3 bg-zinc-900/40">
                <div className="text-zinc-400 text-xs font-bold">Email Outbox</div>
                <div className="text-lg font-bold text-zinc-200">
                  {systemData.outboxes?.emailPending || 0} pending
                </div>
              </div>
              <div className="border border-zinc-800 p-3 bg-zinc-900/40">
                <div className="text-zinc-400 text-xs font-bold">In-App Outbox</div>
                <div className="text-lg font-bold text-zinc-200">
                  {systemData.outboxes?.notificationPending || 0} pending
                </div>
              </div>
              <div className="border border-zinc-800 p-3 bg-zinc-900/40">
                <div className="text-zinc-400 text-xs font-bold">Webhook Outbox</div>
                <div className="text-lg font-bold text-zinc-200">
                  {systemData.outboxes?.webhookPending || 0} pending
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
