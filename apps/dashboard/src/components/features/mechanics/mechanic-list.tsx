'use client';

import { apiFetch } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import React, { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { useDesignOptions, type DesignOptions } from './prize-editor';

type BadgeVariant = 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'zinc' | 'orange' | 'cyan';

/**
 * What one kind of thing needs to be listed, made, changed and removed. The six mechanics pages
 * differ only in this, so they share the list, the dialog and the saving.
 */
export interface MechanicConfig<Row, Draft> {
  /** Path after `/api/projects/:projectId`, such as `/boxes`. */
  endpoint: string;
  /** Lower case, as in "New box" and "The box could not be saved". */
  noun: string;
  icon: ComponentType<{ className?: string }>;
  emptyTitle: string;
  emptyDescription: string;
  dialogDescription: string;
  /** Wide dialogs suit forms with lists in them. */
  wide?: boolean;
  /** Whether rows have an on and off switch. */
  toggles?: boolean;
  deleteMessage: string;
  blank: () => Draft;
  toDraft: (row: Row) => Draft;
  toBody: (draft: Draft, editing: boolean) => Record<string, unknown>;
  title: (row: Row) => string;
  badges?: (row: Row) => { label: string; variant?: BadgeVariant }[];
  /** Short lines under the title. */
  lines: (row: Row) => ReactNode[];
  /** More about a row, shown under its lines. */
  detail?: (row: Row) => ReactNode;
  form: (draft: Draft, set: (patch: Partial<Draft>) => void, options: DesignOptions, editing: boolean) => ReactNode;
}

export function MechanicList<Row extends { id: string; enabled?: boolean }, Draft>({ config }: { config: MechanicConfig<Row, Draft> }) {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();
  const options = useDesignOptions(projectId);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft>(config.blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = `/api/projects/${projectId}${config.endpoint}`;

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}${config.endpoint}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.code === 'FEATURE_DISABLED' ? 'This feature is turned off for your organization by the platform administrator.' : "This couldn't load.");
      }
      setRows((await res.json()).data as Row[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This couldn't load.");
    }
  }, [projectId, config.endpoint]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const openDialog = (row: Row | null) => {
    setEditing(row);
    setDraft(row ? config.toDraft(row) : config.blank());
    setFormError(null);
    setOpen(true);
  };

  const failed = `The ${config.noun} could not be saved.`;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(editing ? `${base}/${editing.id}` : base, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(config.toBody(draft, Boolean(editing))) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? failed);
      toast.success(editing ? 'Saved.' : 'Created.');
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : failed);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: Row, enabled: boolean) => {
    const res = await apiFetch(`${base}/${row.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error((await res.json().catch(() => null))?.message ?? 'The change could not be saved.');
    await load();
  };

  const remove = async (row: Row) => {
    const ok = await confirm({ title: `Delete “${config.title(row)}”?`, message: config.deleteMessage, confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`${base}/${row.id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error('It could not be deleted.');
    await load();
  };

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className="space-y-4">
      {rows && rows.length > 0 && (
        <AdminOnly>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={() => openDialog(null)}>
              <Plus className="h-4 w-4" />
              New {config.noun}
            </Button>
          </div>
        </AdminOnly>
      )}

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          {error}{' '}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!rows && !error && <CardSkeleton />}

      {rows && rows.length === 0 && (
        <EmptyState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyDescription}
          action={isAdminOrOwner ? { label: `Create a ${config.noun}`, onClick: () => openDialog(null) } : undefined}
        />
      )}

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="min-w-0">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-zinc-100">{config.title(row)}</h2>
                      {config.toggles && <Badge variant={row.enabled ? 'emerald' : 'zinc'}>{row.enabled ? 'On' : 'Off'}</Badge>}
                      {config.badges?.(row).map((badge) => (
                        <Badge key={badge.label} variant={badge.variant ?? 'zinc'}>
                          {badge.label}
                        </Badge>
                      ))}
                    </div>
                    {config.lines(row).map((line, index) => (
                      <p key={index} className={`mt-1 text-xs ${index === 0 ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {line}
                      </p>
                    ))}
                  </div>
                  {config.toggles && (
                    <AdminOnly>
                      <Switch checked={Boolean(row.enabled)} onChange={(e) => void toggle(row, e.target.checked)} aria-label={`${config.title(row)} is on`} />
                    </AdminOnly>
                  )}
                </div>
                {config.detail?.(row)}
                <AdminOnly>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openDialog(row)} aria-label={`Edit ${config.title(row)}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(row)} aria-label={`Delete ${config.title(row)}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger-400" />
                    </Button>
                  </div>
                </AdminOnly>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${config.title(editing)}` : `New ${config.noun}`}
        description={config.dialogDescription}
        maxWidth={config.wide ? '3xl' : 'lg'}
      >
        <form onSubmit={save} className="space-y-4">
          {formError && (
            <div role="alert" className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">
              {formError}
            </div>
          )}
          {config.form(draft, set, options, Boolean(editing))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              {editing ? 'Save changes' : `Create ${config.noun}`}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/** A whole number from a form field, or null when it is empty. */
export const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Math.floor(Number(text)));

/** The label above a control that has none of its own. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-semibold text-zinc-300">{children}</span>;
}
