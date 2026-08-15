'use client';

import { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import type { AuditLogItem } from '@/hooks/use-audit-logs';

export function AuditLogsView() {
  const { selectedProject } = useDashboard();

  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogItem | null>(null);

  const { logs, page, totalPages, total, loading, error, setPage, refresh } = useAuditLogs(
    selectedProject?.id || null,
    {
      action: actionFilter || undefined,
      resourceType: resourceFilter || undefined,
    }
  );

  if (!selectedProject) {
    return (
      <div className="p-8 text-center font-mono text-zinc-400">
        Please select a project to view project audit logs.
      </div>
    );
  }

  const getActionBadgeColor = (action: string) => {
    if (action.includes('created') || action.includes('reactivated')) {
      return 'border-emerald-700 bg-emerald-950/40 text-emerald-400';
    }
    if (action.includes('deleted') || action.includes('deactivated') || action.includes('revoked')) {
      return 'border-rose-700 bg-rose-950/40 text-rose-400';
    }
    if (action.includes('updated') || action.includes('adjusted') || action.includes('rotated')) {
      return 'border-amber-700 bg-amber-950/40 text-amber-300';
    }
    if (action.includes('replayed')) {
      return 'border-purple-700 bg-purple-950/40 text-purple-300';
    }
    return 'border-zinc-700 bg-zinc-900 text-zinc-300';
  };

  return (
    <div className="space-y-6 font-mono text-zinc-100">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">Project Audit Logs</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Immutable administrative action audit trail for project{' '}
            <span className="text-emerald-400">{selectedProject.name}</span>. Secrets redacted.
          </p>
        </div>
        <button
          onClick={() => refresh(page)}
          className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition"
        >
          ↻ Refresh Logs
        </button>
      </div>

      {error && (
        <div className="border border-rose-800 bg-rose-950/40 p-4 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 border border-zinc-800 bg-zinc-950 p-4">
        <div>
          <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Action Filter</label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. user.created, xp.manually_adjusted"
            className="w-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Resource Filter</label>
          <input
            type="text"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            placeholder="e.g. user, rule, webhook, event"
            className="w-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => {
              setActionFilter('');
              setResourceFilter('');
            }}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 px-3 py-1.5 text-xs uppercase"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 uppercase text-zinc-400 text-[10px]">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor (Type / ID)</th>
              <th className="px-4 py-3">Resource Target</th>
              <th className="px-4 py-3 text-right">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border border-emerald-500 border-t-transparent animate-spin" />
                    Loading audit logs...
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                  No audit logs recorded for this filter.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/40 font-mono transition-colors">
                  <td className="px-4 py-3 text-zinc-400 text-[11px] whitespace-nowrap">
                    <span title={new Date(log.createdAt).toLocaleString()}>
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase font-bold ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-zinc-300">
                    <div className="text-[11px] font-semibold text-white uppercase">{log.actorType}</div>
                    <div className="text-[10px] text-zinc-500 truncate max-w-[140px]">{log.actorId}</div>
                  </td>

                  <td className="px-4 py-3 text-zinc-300">
                    <div className="text-[11px] font-semibold text-emerald-400 uppercase">{log.resourceType}</div>
                    <div className="text-[10px] text-zinc-500 truncate max-w-[160px]">{log.resourceId}</div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedLogForDetails(log)}
                      className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1 text-[10px] uppercase tracking-wider"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-4 text-xs">
        <span className="text-zinc-500">
          Showing page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong> ({total} total entries)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-300 border border-zinc-800 px-3 py-1.5 text-xs uppercase"
          >
            ← Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-300 border border-zinc-800 px-3 py-1.5 text-xs uppercase"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Details Drawer / Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-4 font-mono text-zinc-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase text-white tracking-wide">
                  Audit Log Record: {selectedLogForDetails.action}
                </h2>
                <div className="text-[10px] text-zinc-500">{selectedLogForDetails.id}</div>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-zinc-500 hover:text-white text-xs uppercase border border-zinc-800 px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-zinc-900/60 p-3 border border-zinc-800">
                <div>
                  <span className="text-[10px] uppercase text-zinc-500 block font-bold">Timestamp</span>
                  <span className="text-zinc-200">{new Date(selectedLogForDetails.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-500 block font-bold">Action</span>
                  <span className="text-emerald-400 font-bold">{selectedLogForDetails.action}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-500 block font-bold">Actor</span>
                  <span className="text-zinc-200">{selectedLogForDetails.actorType} ({selectedLogForDetails.actorId})</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-500 block font-bold">Target Resource</span>
                  <span className="text-zinc-200">{selectedLogForDetails.resourceType} ({selectedLogForDetails.resourceId})</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-zinc-500 block font-bold mb-1">
                  Metadata (Redacted)
                </label>
                <pre className="bg-zinc-900 border border-zinc-800 p-3 text-[11px] text-emerald-300 font-mono overflow-x-auto">
                  {JSON.stringify(selectedLogForDetails.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1.5 text-xs uppercase border border-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
