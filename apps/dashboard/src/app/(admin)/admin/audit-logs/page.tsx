'use client';

import { useEffect, useState } from 'react';
import { History, ShieldAlert, AlertTriangle, Info, Search } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';

interface AuditRecord {
  id: string;
  organizationId?: string | null;
  projectId?: string | null;
  actorType: string;
  actorId: string;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const severityOptions = [
  { value: '', label: 'All Severities' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAuditLogs();
  }, [severityFilter]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (severityFilter) query.set('severity', severityFilter);

      const res = await fetch(`/api/admin/audit-logs?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.auditLogs || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch global audit logs');
      }
    } catch {
      setError('Network error fetching audit logs');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actorId.toLowerCase().includes(search.toLowerCase()) ||
      l.resourceId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 font-mono">
      <div className="border-b border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
            <History className="w-5 h-5 text-rose-400" />
            Global Platform Audit Logs
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Server-wide security events, configuration updates, and administrative activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Dropdown
            options={severityOptions}
            value={severityFilter}
            onChange={setSeverityFilter}
            placeholder="All Severities"
            theme="rose"
            className="w-44"
          />

          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 px-3 py-1.5 pl-9 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Loading audit trail...
        </div>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Resource Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-900/60 transition">
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {l.severity === 'critical' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 border border-rose-800 bg-rose-950/60 text-rose-400">
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          Critical
                        </span>
                      ) : l.severity === 'warning' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 border border-amber-800 bg-amber-950/60 text-amber-400">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          Warning
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-400">
                          <Info className="w-3 h-3 text-zinc-400" />
                          Info
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-100">{l.action}</td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-400">{l.actorType}:</span>{' '}
                      <span className="text-zinc-200">{l.actorId}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {l.resourceType} ({l.resourceId})
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      No audit records found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
