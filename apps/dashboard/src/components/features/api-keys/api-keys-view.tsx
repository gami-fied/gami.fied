'use client';

import React, { useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useApiKeys, GeneratedApiKey } from '@/hooks/use-api-keys';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Copy, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/hooks/use-relative-time';

export function ApiKeysView() {
  const { selectedProject } = useDashboard();
  const toast = useToast();
  const { apiKeys, error, fetchApiKeys, createApiKey, revokeApiKey } = useApiKeys(
    selectedProject?.id || null
  );

  // Create Key Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One-time Raw Secret Modal State
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke Confirm State
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProject) {
      fetchApiKeys();
    }
  }, [selectedProject, fetchApiKeys]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const newKey = await createApiKey(keyName.trim());
      setIsCreateOpen(false);
      setKeyName('');
      setGeneratedKey(newKey);
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey.rawSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeConfirm = async () => {
    if (!revokingKeyId) return;
    try {
      await revokeApiKey(revokingKeyId);
      setRevokingKeyId(null);
      toast.info('API key revoked');
    } catch (err: unknown) {
      toast.error('Failed to revoke API key', (err as Error).message);
    }
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to view API keys.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">API Keys Management</h1>
          <p className="text-xs text-zinc-400 mt-1">
            API keys used for authenticating public event ingestion endpoints (`/v1/events`) for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Generate API Key
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
          {error}
        </div>
      )}

      {/* Keys Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((k) => {
                const isRevoked = !!k.revokedAt;
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-semibold text-zinc-200">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">
                      {k.keyPrefix}...
                    </TableCell>
                    <TableCell
                      className="text-xs text-zinc-400 cursor-default"
                      title={new Date(k.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(k.createdAt)}
                    </TableCell>
                    <TableCell
                      className="text-xs text-zinc-400 cursor-default"
                      title={k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                    >
                      {formatRelativeTime(k.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isRevoked ? 'rose' : 'emerald'}>
                        {isRevoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isRevoked && (
                        <button
                          onClick={() => setRevokingKeyId(k.id)}
                          className="text-xs text-rose-400 hover:underline font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Revoke Key
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {apiKeys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                    No API keys generated yet. Generate your first API key to authenticate event
                    ingestion.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Generate New API Key"
        description="Provide a descriptive name to identify this API key."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <div className="text-xs text-rose-400 font-medium">{formError}</div>}

          <Input
            label="API Key Name"
            placeholder="e.g. Backend Production Server"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Generate Key
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ONE-TIME RAW SECRET DISPLAY MODAL */}
      <Dialog
        isOpen={!!generatedKey}
        onClose={() => setGeneratedKey(null)}
        title="API Key Created Successfully"
        footer={
          <Button variant="primary" onClick={() => setGeneratedKey(null)}>
            I Have Saved My Secret Key
          </Button>
        }
      >
        {generatedKey && (
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-none flex items-start gap-3 text-amber-300 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-200">Save your secret key now!</p>
                <p className="mt-1 leading-relaxed text-amber-300/90">
                  This raw secret key is displayed **only once** for security reasons. We only store
                  an encrypted hash on our servers. If you lose this key, you will have to generate
                  a new one.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Secret API Key for <span className="text-orange-400">{generatedKey.name}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedKey.rawSecret}
                  className="flex-1 h-10 bg-zinc-900/70 border border-zinc-800 rounded-none px-3.5 py-2 font-mono text-xs text-emerald-400 font-semibold select-all outline-none hover:border-zinc-700 focus:border-emerald-500/80 transition-colors duration-150 shadow-none"
                />
                <Button variant="secondary" size="md" onClick={handleCopySecret}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Confirm Revoke Dialog */}
      <ConfirmDialog
        isOpen={!!revokingKeyId}
        onClose={() => setRevokingKeyId(null)}
        onConfirm={handleRevokeConfirm}
        title="Revoke API Key"
        message="Are you sure you want to revoke this API key? Applications using this key will immediately lose access to event ingestion."
        isDanger
        confirmText="Revoke API Key"
      />
    </div>
  );
}
