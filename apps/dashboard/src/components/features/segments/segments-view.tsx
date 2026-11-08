'use client';

import { apiFetch } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Edit2, Filter, Plus, Trash2, UsersRound, X } from 'lucide-react';

type Operator = 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'exists' | 'not_exists' | 'greater_than' | 'less_than';

interface Condition {
  field: string;
  operator: Operator;
  value?: unknown;
}

interface Segment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  filter: { match: 'all' | 'any'; conditions: Condition[] };
}

interface Preview {
  count: number;
  sample: { id: string; externalId: string; name: string | null; totalXp: number }[];
}

const FIELD_OPTIONS = [
  { value: 'metadata.', label: 'Something in metadata', sublabel: 'For example metadata.country or metadata.plan' },
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'externalId', label: 'Your ID for them' },
  { value: 'createdAt', label: 'Joined', sublabel: 'Compare with a date' },
  { value: 'totalXp', label: 'Total XP' },
];

const OPERATOR_OPTIONS: { value: Operator; label: string }[] = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is none of' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'greater_than', label: 'is more than' },
  { value: 'less_than', label: 'is less than' },
  { value: 'exists', label: 'is set' },
  { value: 'not_exists', label: 'is not set' },
];

const NO_VALUE: Operator[] = ['exists', 'not_exists'];
const LIST: Operator[] = ['in', 'not_in'];

interface Row {
  fieldKind: string;
  metadataKey: string;
  operator: Operator;
  value: string;
}

const toRow = (condition: Condition): Row => {
  const isMeta = condition.field.startsWith('metadata.');
  return {
    fieldKind: isMeta ? 'metadata.' : condition.field,
    metadataKey: isMeta ? condition.field.slice('metadata.'.length) : '',
    operator: condition.operator,
    value: Array.isArray(condition.value) ? condition.value.join(', ') : condition.value === undefined || condition.value === null ? '' : String(condition.value),
  };
};

const toCondition = (row: Row): Condition => {
  const field = row.fieldKind === 'metadata.' ? `metadata.${row.metadataKey.trim()}` : row.fieldKind;
  if (NO_VALUE.includes(row.operator)) return { field, operator: row.operator };
  if (LIST.includes(row.operator)) return { field, operator: row.operator, value: row.value.split(',').map((part) => part.trim()).filter(Boolean) };
  return { field, operator: row.operator, value: row.value.trim() };
};

function describe(condition: Condition): string {
  const op = OPERATOR_OPTIONS.find((item) => item.value === condition.operator)?.label ?? condition.operator;
  const value = Array.isArray(condition.value) ? condition.value.join(', ') : condition.value;
  return `${condition.field} ${op}${value !== undefined ? ` ${String(value)}` : ''}`;
}

const blankRow = (): Row => ({ fieldKind: 'metadata.', metadataKey: 'country', operator: 'equals', value: '' });

export function SegmentsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/segments`);
      if (!res.ok) throw new Error('failed');
      const list = (await res.json()).data as Segment[];
      setSegments(list);
      // Member counts load after the list, so the page never waits on them.
      const entries = await Promise.all(
        list.map(async (segment) => {
          const r = await apiFetch(`/api/projects/${projectId}/segments/${segment.id}/members`);
          return [segment.id, r.ok ? ((await r.json()) as Preview).count : 0] as const;
        })
      );
      setCounts(Object.fromEntries(entries));
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setSegments(null);
    void load();
  }, [load]);

  // Show who matches while the conditions are edited.
  useEffect(() => {
    if (!open || !projectId) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/segments/preview`, { method: 'POST', body: JSON.stringify({ filter: { match, conditions: rows.map(toCondition) } }) });
        const body = await res.json();
        if (!res.ok) {
          setPreview(null);
          setPreviewError(body.message ?? 'Check the conditions');
          return;
        }
        setPreviewError(null);
        setPreview(body);
      } catch {
        setPreviewError('The preview could not load');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [open, projectId, match, rows]);

  const openDialog = (segment: Segment | null) => {
    setEditing(segment);
    setName(segment?.name ?? '');
    setKey(segment?.key ?? '');
    setDescription(segment?.description ?? '');
    setMatch(segment?.filter.match ?? 'all');
    setRows(segment ? segment.filter.conditions.map(toRow) : [blankRow()]);
    setPreview(null);
    setPreviewError(null);
    setFormError(null);
    setOpen(true);
  };

  const updateRow = (index: number, patch: Partial<Row>) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const filter = { match, conditions: rows.map(toCondition) };
      const res = await apiFetch(editing ? `/api/projects/${projectId}/segments/${editing.id}` : `/api/projects/${projectId}/segments`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(editing ? { name: name.trim(), description: description.trim() || null, filter } : { key: key.trim(), name: name.trim(), description: description.trim() || null, filter }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The segment could not be saved.');
      toast.success(editing ? 'Segment saved.' : 'Segment created.');
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The segment could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (segment: Segment) => {
    if (!projectId) return;
    const ok = await confirm({ title: `Delete “${segment.name}”?`, message: 'Boards and apps that ask for this segment will get an error until you remove it from them.', confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/segments/${segment.id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error('It could not be deleted.');
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segments"
        description="Save groups of people, such as a country, a plan or new joiners, and give each its own leaderboard."
        actions={
          <AdminOnly>
            <Button variant="primary" size="sm" onClick={() => openDialog(null)}>
              <Plus className="h-4 w-4" />
              New segment
            </Button>
          </AdminOnly>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!segments && !error && <CardSkeleton />}

      {segments && (
        <>
          <p className="text-xs text-zinc-400">
            Segments read what you store about people: their name, email, when they joined, their XP, and any field in their metadata. Membership is worked out when a board is read, so people move in and out as their details change.
          </p>
          {segments.length === 0 && (
            <EmptyState icon={UsersRound} title="No segments yet" description="Create one, such as everyone in India, or everyone on the Pro plan." action={isAdminOrOwner ? { label: 'Create a segment', onClick: () => openDialog(null) } : undefined} />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {segments.map((segment) => (
              <Card key={segment.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{segment.name}</h2>
                        <Badge variant="zinc">{counts[segment.id] === undefined ? '…' : `${counts[segment.id]!.toLocaleString()} people`}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{segment.key}</p>
                      {segment.description && <p className="mt-1 text-xs text-zinc-400">{segment.description}</p>}
                      <ul className="mt-2 space-y-0.5 text-xs text-zinc-300">
                        {segment.filter.conditions.map((condition, index) => (
                          <li key={index}>
                            {index > 0 && <span className="mr-1 text-zinc-500">{segment.filter.match === 'all' ? 'and' : 'or'}</span>}
                            {describe(condition)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Link href="/dashboard/leaderboard" className="text-xs text-brand-400 hover:underline">
                      See its leaderboard
                    </Link>
                    <AdminOnly>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDialog(segment)} aria-label={`Edit ${segment.name}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => void remove(segment)} aria-label={`Delete ${segment.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                      </div>
                    </AdminOnly>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog isOpen={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New segment'} description="Pick people by what you know about them." maxWidth="3xl">
        <form onSubmit={save} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Players in India" required />
            {!editing && <Input label="Key *" value={key} onChange={(e) => setKey(e.target.value)} placeholder="india" helperText="Used by the API, such as ?segment=india. It cannot change later." required />}
          </div>
          <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <span>People who match</span>
              <div className="w-28">
                <Dropdown options={[{ value: 'all', label: 'all of' }, { value: 'any', label: 'any of' }]} value={match} onChange={(value) => setMatch(value as 'all' | 'any')} />
              </div>
              <span>these:</span>
            </div>
            {rows.map((row, index) => (
              <div key={index} className="grid gap-2 border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Dropdown options={FIELD_OPTIONS} value={row.fieldKind} onChange={(value) => updateRow(index, { fieldKind: value })} />
                  {row.fieldKind === 'metadata.' && <Input aria-label="Metadata field" value={row.metadataKey} onChange={(e) => updateRow(index, { metadataKey: e.target.value })} placeholder="country" />}
                </div>
                <Dropdown options={OPERATOR_OPTIONS} value={row.operator} onChange={(value) => updateRow(index, { operator: value as Operator })} />
                {NO_VALUE.includes(row.operator) ? (
                  <span className="text-xs text-zinc-500">No value needed</span>
                ) : (
                  <Input
                    aria-label="Value"
                    value={row.value}
                    onChange={(e) => updateRow(index, { value: e.target.value })}
                    placeholder={LIST.includes(row.operator) ? 'IN, US, GB' : row.fieldKind === 'createdAt' ? '2026-01-01' : 'IN'}
                    type={row.fieldKind === 'createdAt' && !LIST.includes(row.operator) ? 'date' : 'text'}
                  />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, i) => i !== index))} disabled={rows.length === 1} aria-label="Remove condition">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, blankRow()])} disabled={rows.length >= 20}>
              <Plus className="h-3.5 w-3.5" />
              Add a condition
            </Button>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
            <div className="mb-2 flex items-center gap-2 font-semibold text-zinc-300">
              <Filter className="h-3.5 w-3.5" />
              {previewError ? <span className="text-warning-300">{previewError}</span> : preview ? `${preview.count.toLocaleString()} ${preview.count === 1 ? 'person matches' : 'people match'}` : 'Checking…'}
            </div>
            {preview && preview.sample.length > 0 && (
              <ul className="grid gap-1 sm:grid-cols-2">
                {preview.sample.map((person) => (
                  <li key={person.id} className="truncate text-zinc-400">
                    {person.name || person.externalId} <span className="text-zinc-600">· {person.totalXp.toLocaleString()} XP</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>{editing ? 'Save changes' : 'Create segment'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
