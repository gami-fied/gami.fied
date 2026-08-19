'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  Database,
  ShieldCheck,
  RefreshCw,
  Trash2,
  RotateCcw,
  Plus,
  AlertTriangle,
  FileCheck,
  Lock,
  HardDrive,
} from 'lucide-react';

export default function AdminBackupsPage() {
  const toast = useToast();
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<any>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<any>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupType: 'manual', encrypt: true }),
      });
      if (res.ok) {
        toast.success('PostgreSQL backup created successfully', 'SHA-256 integrity verified');
        await fetchBackups();
      } else {
        let errMsg = 'Backup creation failed';
        try {
          const errData = await res.json();
          errMsg = errData.message || errData.error?.message || errData.error || errMsg;
        } catch {}
        toast.error('Backup creation failed', errMsg);
      }
    } catch (err: any) {
      toast.error('Backup creation error', err?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/backups/${id}/verify`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.info('Backup verification complete', `Status: ${data.verificationStatus}`);
        await fetchBackups();
      } else {
        toast.error('Verification failed');
      }
    } catch (err: any) {
      toast.error('Verification error', err?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteBackup = async () => {
    if (!backupToDelete) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/backups/${backupToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Platform backup deleted successfully');
        setBackupToDelete(null);
        await fetchBackups();
      } else {
        toast.error('Failed to delete platform backup');
      }
    } catch (err: any) {
      toast.error('Delete error', err?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/backups/${selectedBackup.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmRestore: true }),
      });
      if (res.ok) {
        toast.success('Database restoration executed', 'Pre-restore safety backup created.');
        setShowRestoreModal(false);
        await fetchBackups();
      } else {
        const err = await res.json();
        toast.error('Restore failed', err?.message || 'Error executing restore');
      }
    } catch (err: any) {
      toast.error('Restore error', err?.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-zinc-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Platform Backups</h1>
          <p className="text-xs text-zinc-400 mt-1">
            PostgreSQL multi-tenant database snapshots, checksum verifications, and disaster recovery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBackups}
            className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleCreateBackup}
            disabled={actionLoading}
            className="px-4 py-2 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Create PostgreSQL Backup
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-zinc-950 border border-zinc-800 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 space-y-1">
          <p className="font-mono font-semibold text-rose-400 uppercase tracking-wider">
            Platform Infrastructure Security Guarantee
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Platform backups snapshot all system-wide infrastructure and multi-tenant tables. Physical files are stored on persistent host storage with SHA-256 integrity verification and AES-256-GCM encryption at rest.
          </p>
        </div>
      </div>

      {/* Backups Catalog Table */}
      <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-bold uppercase text-white">Backup Catalog</h2>
          </div>
          <span className="text-xs text-zinc-500 font-semibold">{backups.length} total backup(s)</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading platform backup catalog...</div>
        ) : backups.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            No platform backups created yet. Click "Create PostgreSQL Backup" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase text-[11px]">
                <tr>
                  <th className="p-3">Backup ID</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Verification</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Security</th>
                  <th className="p-3">Created At</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-900/40 transition">
                    <td className="p-3 font-semibold text-white">{b.id}</td>
                    <td className="p-3 capitalize text-zinc-400">{b.backupType}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] uppercase font-bold border ${
                          b.status === 'verified' || b.status === 'available'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                            : b.status === 'restored'
                            ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60'
                            : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] uppercase font-bold ${
                          b.verificationStatus === 'passed' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {b.verificationStatus}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td className="p-3">
                      {b.encrypted ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                          <Lock className="w-3 h-3" /> AES-256
                        </span>
                      ) : (
                        <span className="text-zinc-500">Plain</span>
                      )}
                    </td>
                    <td className="p-3 text-zinc-400">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleVerifyBackup(b.id)}
                        disabled={actionLoading}
                        className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[11px] transition"
                        title="Verify SHA-256 Checksum"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedBackup(b);
                          setShowRestoreModal(true);
                        }}
                        disabled={actionLoading || b.status === 'failed'}
                        className="px-2 py-1 bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 text-[11px] transition"
                        title="Restore Database"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setBackupToDelete(b)}
                        disabled={actionLoading}
                        className="px-2 py-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-[11px] transition"
                        title="Delete Backup"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {backupToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-rose-800 p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <Trash2 className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <h3 className="text-base font-bold uppercase text-white">Confirm Delete Platform Backup</h3>
                <p className="text-xs text-zinc-400">
                  Backup ID: <span className="font-mono text-rose-400">{backupToDelete.id}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete backup file{' '}
              <span className="font-mono text-white">{backupToDelete.filename}</span> from platform storage?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setBackupToDelete(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteBackup}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold uppercase"
              >
                {actionLoading ? 'Deleting...' : 'Confirm & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreModal && selectedBackup && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-amber-800 p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-base font-bold uppercase text-white">Confirm Destructive Database Restore</h3>
                <p className="text-xs text-zinc-400">
                  Target Backup: <span className="font-mono text-amber-400">{selectedBackup.id}</span>
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-300 space-y-2 bg-amber-950/40 border border-amber-800/60 p-3">
              <p className="font-bold text-amber-300 uppercase">⚠️ Critical Safeguards Notice:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-400">
                <li>
                  Restoration will replace committed database state with the backup snapshot taken on{' '}
                  <span className="text-white font-mono">{new Date(selectedBackup.createdAt).toLocaleString()}</span>.
                </li>
                <li>
                  A mandatory <span className="text-emerald-400 font-semibold">Pre-Restore Safety Backup</span> will be created automatically before restoring.
                </li>
                <li>Requested backup SHA-256 integrity will be verified prior to restoration.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRestoreModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreBackup}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold uppercase flex items-center gap-2"
              >
                {actionLoading ? 'Executing Restore...' : 'Confirm & Restore Database'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
