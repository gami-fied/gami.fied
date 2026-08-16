'use client';

import React, { useEffect, useState } from 'react';
import {
  Database,
  Trash2,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileText,
  Mail,
  Webhook,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/dialog';

interface TableMetric {
  id: string;
  name: string;
  description: string;
  totalRows: number;
  completedRows?: number;
  failedRows?: number;
}

interface StorageMetrics {
  databaseSizeBytes: number;
  tables: Record<string, TableMetric>;
}

export default function AdminStoragePage() {
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Retention selection per table
  const [retentionMap, setRetentionMap] = useState<Record<string, number>>({
    webhook_outbox: 0,
    integration_deliveries: 0,
    email_outbox: 0,
    event_outbox: 0,
    rule_executions: 30,
    audit_logs: 90,
  });

  // Modal confirmation state
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    name: string;
    olderThanDays: number;
  } | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/storage/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch storage metrics');
      }
    } catch {
      setError('Network error fetching storage metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleExecuteClean = async () => {
    if (!confirmTarget) return;
    setCleaning(true);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/storage/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: confirmTarget.id,
          olderThanDays: confirmTarget.olderThanDays,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setActionSuccess(result.message || 'Cleanup completed successfully.');
        fetchMetrics();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to execute storage cleanup');
      }
    } catch {
      setError('Network error executing storage cleanup');
    } finally {
      setCleaning(false);
      setConfirmTarget(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateTotalRows = (): number => {
    if (!metrics?.tables) return 0;
    return Object.values(metrics.tables).reduce((sum, t) => sum + (t.totalRows || 0), 0);
  };

  const getTableIcon = (id: string) => {
    switch (id) {
      case 'webhook_outbox':
        return <Webhook className="w-4 h-4 text-purple-400" />;
      case 'integration_deliveries':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'email_outbox':
        return <Mail className="w-4 h-4 text-emerald-400" />;
      case 'event_outbox':
        return <Activity className="w-4 h-4 text-orange-400" />;
      case 'rule_executions':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'audit_logs':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      default:
        return <Database className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-rose-400" />
            <h1 className="text-xl font-bold uppercase tracking-wider text-white">
              Database Storage & Maintenance
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Inspect storage usage across event outboxes, delivery logs, audit history, and rule execution records. Prune historical logs and clear redundant data to maintain optimal database performance.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs uppercase tracking-wider transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </button>
          <button
            onClick={() =>
              setConfirmTarget({
                id: 'all_completed_logs',
                name: 'All Completed Delivery & Outbox Logs',
                olderThanDays: 0,
              })
            }
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 text-xs font-bold uppercase tracking-wider transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge All Completed Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>Database Disk Size</span>
            <HardDrive className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {metrics?.databaseSizeBytes ? formatBytes(metrics.databaseSizeBytes) : 'PostgreSQL DB'}
          </div>
          <p className="text-[11px] text-zinc-500">
            Total disk space allocated to the active PostgreSQL database instance.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>Total Logged Records</span>
            <Layers className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {calculateTotalRows().toLocaleString()} <span className="text-xs font-normal text-zinc-400">rows</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Combined total records stored across outboxes, delivery logs & audit history.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider">
            <span>Log Category Services</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {metrics?.tables ? Object.keys(metrics.tables).length : 6} <span className="text-xs font-normal text-zinc-400">monitored tables</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Independent log and history outboxes configured for automated maintenance.
          </p>
        </div>
      </div>

      {/* Storage Service Breakdown Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800/80 pb-2">
          Monitored Storage Tables & Maintenance Actions
        </h2>

        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-400 bg-zinc-950 border border-zinc-800">
            Loading storage & table metrics...
          </div>
        ) : !metrics?.tables ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-950 border border-zinc-800">
            No table metrics available.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(metrics.tables).map(([key, table]) => {
              const selectedRetention = retentionMap[key] ?? 0;

              return (
                <div
                  key={key}
                  className="bg-zinc-950 border border-zinc-800 p-4 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getTableIcon(key)}
                        <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider truncate">
                          {table.name}
                        </h3>
                      </div>
                      <span className="text-xs font-bold text-rose-400 border border-rose-900 bg-rose-950/60 px-2 py-0.5 shrink-0">
                        {table.totalRows.toLocaleString()} rows
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed min-h-[32px]">
                      {table.description}
                    </p>

                    {/* Breakdown metrics */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2 bg-zinc-900/60 border border-zinc-800/80 text-[11px]">
                        <span className="text-zinc-500 block uppercase text-[9px] tracking-wider">Completed / Sent</span>
                        <span className="text-emerald-400 font-bold">
                          {(table.completedRows ?? table.totalRows).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2 bg-zinc-900/60 border border-zinc-800/80 text-[11px]">
                        <span className="text-zinc-500 block uppercase text-[9px] tracking-wider">Failed / Error</span>
                        <span className="text-rose-400 font-bold">
                          {(table.failedRows ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Retention Selector */}
                  <div className="space-y-2 pt-3 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400 uppercase tracking-wider">Prune Filter:</span>
                      <select
                        value={selectedRetention}
                        onChange={(e) =>
                          setRetentionMap((prev) => ({
                            ...prev,
                            [key]: parseInt(e.target.value, 10),
                          }))
                        }
                        className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-[11px] px-2 py-1 focus:outline-none focus:border-rose-500"
                      >
                        <option value={0}>All Completed Logs</option>
                        <option value={7}>Older than 7 Days</option>
                        <option value={30}>Older than 30 Days</option>
                        <option value={90}>Older than 90 Days</option>
                      </select>
                    </div>

                    <button
                      onClick={() =>
                        setConfirmTarget({
                          id: key,
                          name: table.name,
                          olderThanDays: selectedRetention,
                        })
                      }
                      disabled={table.totalRows === 0}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-zinc-900 border border-zinc-700 hover:bg-rose-950/60 hover:border-rose-800 text-zinc-200 hover:text-rose-300 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      Clean Table Logs
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmTarget && (
        <ConfirmDialog
          isOpen={Boolean(confirmTarget)}
          onClose={() => setConfirmTarget(null)}
          onConfirm={handleExecuteClean}
          title={`Clean ${confirmTarget.name}?`}
          message={`Are you sure you want to clean logs from "${confirmTarget.name}"? ${
            confirmTarget.olderThanDays === 0
              ? 'This will delete all completed log entries from this service.'
              : `This will delete completed log entries older than ${confirmTarget.olderThanDays} days.`
          } Deleted log records cannot be recovered.`}
          confirmText="Execute Cleanup"
          cancelText="Cancel"
          isDanger={true}
          isLoading={cleaning}
        />
      )}
    </div>
  );
}
