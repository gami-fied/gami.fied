'use client';

import { Dialog } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  ShieldCheck,
  RefreshCw,
  Trash2,
  RotateCcw,
  Plus,
  FileCheck,
  Lock,
  HardDrive,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

interface BackupRecord {
  id: string;
  filename: string;
  backupType: string;
  status: string;
  verificationStatus: string;
  sizeBytes: number;
  encrypted: boolean;
  createdAt: string;
}

export default function AdminBackupsPage() {
  const toast = useToast();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<BackupRecord | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/admin/backups');
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
      const res = await apiFetch('/api/v1/admin/backups', {
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
        } catch {
          // Keep the default message when the response is not JSON
        }
        toast.error('Backup creation failed', errMsg);
      }
    } catch (err: unknown) {
      toast.error('Backup creation error', (err as Error)?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/backups/${id}/verify`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.info('Backup verification complete', `Status: ${data.verificationStatus}`);
        await fetchBackups();
      } else {
        toast.error('Verification failed');
      }
    } catch (err: unknown) {
      toast.error('Verification error', (err as Error)?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteBackup = async () => {
    if (!backupToDelete) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/backups/${backupToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Platform backup deleted successfully');
        setBackupToDelete(null);
        await fetchBackups();
      } else {
        toast.error('Failed to delete platform backup');
      }
    } catch (err: unknown) {
      toast.error('Delete error', (err as Error)?.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/backups/${selectedBackup.id}/restore`, {
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
        toast.error('Restore failed', (err as Error)?.message || 'Error executing restore');
      }
    } catch (err: unknown) {
      toast.error('Restore error', (err as Error)?.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Header */}
      <PageHeader
        title="Backups"
        description="Database backups for this server, and how to restore them."
        actions={
          <>
            <button
              onClick={fetchBackups}
              className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition"
              title="Refresh Catalog"
              aria-label="Refresh Catalog"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleCreateBackup}
              disabled={actionLoading}
              className="px-4 py-2 bg-danger-950 hover:bg-danger-900 text-danger-300 border border-danger-800 text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Create PostgreSQL Backup
            </button>
          </>
        }
      />

      {/* Info Card */}
      <div className="bg-zinc-950 border border-zinc-800 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-danger-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 space-y-1">
          <p className="font-semibold text-danger-400">
            Platform Infrastructure Security Guarantee
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Platform backups snapshot all system-wide infrastructure and multi-tenant tables.
            Physical files are stored on persistent host storage with SHA-256 integrity verification
            and AES-256-GCM encryption at rest.
          </p>
        </div>
      </div>

      {/* Backups Catalog Table */}
      <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-danger-400" />
            <h2 className="text-sm font-bold text-white">Backup Catalog</h2>
          </div>
          <span className="text-xs text-zinc-400 font-semibold">
            {backups.length} total backup(s)
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            Loading platform backup catalog...
          </div>
        ) : backups.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            No platform backups created yet. Click "Create PostgreSQL Backup" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 text-[11px]">
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
                        className={`px-2 py-0.5 text-xs font-bold border ${
                          b.status === 'verified' || b.status === 'available'
                            ? 'bg-success-950/60 text-success-400 border-success-800/60'
                            : b.status === 'restored'
                              ? 'bg-info-950/60 text-info-400 border-info-800/60'
                              : 'bg-danger-950/60 text-danger-400 border-danger-800/60'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold ${
                          b.verificationStatus === 'passed' ? 'text-success-400' : 'text-danger-400'
                        }`}
                      >
                        {b.verificationStatus}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td className="p-3">
                      {b.encrypted ? (
                        <span className="flex items-center gap-1 text-success-400 text-[11px]">
                          <Lock className="w-3 h-3" /> AES-256
                        </span>
                      ) : (
                        <span className="text-zinc-400">Plain</span>
                      )}
                    </td>
                    <td className="p-3 text-zinc-400">{formatDateTime(b.createdAt)}</td>
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
                        className="px-2 py-1 bg-warning-950/50 hover:bg-warning-900/60 text-warning-300 border border-warning-800/60 text-[11px] transition"
                        title="Restore Database"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setBackupToDelete(b)}
                        disabled={actionLoading}
                        className="px-2 py-1 bg-danger-950/50 hover:bg-danger-900/60 text-danger-300 border border-danger-800/60 text-[11px] transition"
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
        <Dialog
          isOpen
          onClose={() => setBackupToDelete(null)}
          title="Delete this backup?"
          description={`Backup ${backupToDelete.id}`}
          maxWidth="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBackupToDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDeleteBackup}
                isLoading={actionLoading}
              >
                Delete backup
              </Button>
            </>
          }
        >
          <p className="text-xs text-zinc-300 leading-relaxed">
            Are you sure you want to permanently delete backup file{' '}
            <span className="text-white">{backupToDelete.filename}</span> from platform storage?
          </p>
        </Dialog>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreModal && selectedBackup && (
        <Dialog
          isOpen
          onClose={() => setShowRestoreModal(false)}
          title="Restore this backup?"
          description={`Backup ${selectedBackup.id}`}
          maxWidth="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowRestoreModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRestoreBackup} isLoading={actionLoading}>
                Restore database
              </Button>
            </>
          }
        >
          <div className="text-xs text-zinc-300 space-y-2 bg-warning-950/40 border border-warning-800/60 p-3">
            <p className="font-bold text-warning-300">⚠️ Critical Safeguards Notice:</p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400">
              <li>
                Restoration will replace committed database state with the backup snapshot taken on{' '}
                <span className="text-white">{formatDateTime(selectedBackup.createdAt)}</span>.
              </li>
              <li>
                A mandatory{' '}
                <span className="text-success-400 font-semibold">Pre-Restore Safety Backup</span>{' '}
                will be created automatically before restoring.
              </li>
              <li>Requested backup SHA-256 integrity will be verified prior to restoration.</li>
            </ul>
          </div>
        </Dialog>
      )}
    </div>
  );
}
