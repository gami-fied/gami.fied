'use client';

import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { usePermissions } from '@/hooks/use-permissions';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Edit2, Flame, Plus, Snowflake, Trash2, Zap } from 'lucide-react';

interface StreakDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  cadence: 'daily' | 'weekly';
  timeZone: string;
  freezeEvery: number;
  maxFreezes: number;
  enabled: boolean;
}

interface Leader {
  userId: string;
  externalId: string;
  name: string | null;
  current: number;
  longest: number;
  atRisk: boolean;
  lastActivityAt: string | null;
}

interface FormState {
  key: string;
  name: string;
  description: string;
  triggerEvent: string;
  cadence: 'daily' | 'weekly';
  timeZone: string;
  freezeEvery: string;
  maxFreezes: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  key: '',
  name: '',
  description: '',
  triggerEvent: '',
  cadence: 'daily',
  timeZone: 'UTC',
  freezeEvery: '0',
  maxFreezes: '0',
  enabled: true,
};

const CADENCE_OPTIONS = [
  { value: 'daily', label: 'Every day', sublabel: 'One action a day keeps it going' },
  { value: 'weekly', label: 'Every week', sublabel: 'Weeks run Monday to Sunday' },
];

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function StreaksView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [streaks, setStreaks] = useState<StreakDefinition[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StreakDefinition | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leadersFor, setLeadersFor] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const zones = useMemo(timeZones, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/streaks`);
      if (!res.ok) throw new Error('failed');
      setStreaks((await res.json()).data);
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setStreaks(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!projectId || !leadersFor) return;
    setLeaders(null);
    apiFetch(`/api/projects/${projectId}/streaks/${leadersFor}/leaders`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => setLeaders(body.data))
      .catch(() => setLeaders([]));
  }, [projectId, leadersFor]);

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setOpen(true);
  };

  const startEdit = (streak: StreakDefinition) => {
    setEditing(streak);
    setForm({
      key: streak.key,
      name: streak.name,
      description: streak.description ?? '',
      triggerEvent: streak.triggerEvent,
      cadence: streak.cadence,
      timeZone: streak.timeZone,
      freezeEvery: String(streak.freezeEvery),
      maxFreezes: String(streak.maxFreezes),
      enabled: streak.enabled,
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);

    const shared = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      timeZone: form.timeZone.trim() || 'UTC',
      freezeEvery: Number(form.freezeEvery) || 0,
      maxFreezes: Number(form.maxFreezes) || 0,
      enabled: form.enabled,
    };

    try {
      const res = await apiFetch(
        editing ? `/api/projects/${projectId}/streaks/${editing.id}` : `/api/projects/${projectId}/streaks`,
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(
            editing
              ? shared
              : { ...shared, key: form.key.trim(), triggerEvent: form.triggerEvent.trim(), cadence: form.cadence }
          ),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.details ? Object.values(body.details as Record<string, { _errors?: string[] }>).flatMap((v) => v?._errors ?? [])[0] : null;
        throw new Error(detail || body?.message || 'The streak could not be saved.');
      }
      toast.success(editing ? 'Streak updated.' : 'Streak created.');
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The streak could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (streak: StreakDefinition, enabled: boolean) => {
    if (!projectId) return;
    setStreaks((current) => current?.map((item) => (item.id === streak.id ? { ...item, enabled } : item)) ?? null);
    const res = await apiFetch(`/api/projects/${projectId}/streaks/${streak.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error('The change could not be saved.');
      void load();
    }
  };

  const remove = async (streak: StreakDefinition) => {
    if (!projectId) return;
    const confirmed = await confirm({
      title: `Delete "${streak.name}"?`,
      message: 'Every user loses their progress and history on this streak. This cannot be undone.',
      confirmText: 'Delete streak',
      isDanger: true,
    });
    if (!confirmed) return;
    const res = await apiFetch(`/api/projects/${projectId}/streaks/${streak.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Streak deleted.');
      if (leadersFor === streak.id) setLeadersFor(null);
      void load();
    } else {
      toast.error('The streak could not be deleted.');
    }
  };

  const unit = form.cadence === 'weekly' ? 'weeks' : 'days';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Streaks"
        description="Reward people for coming back. A streak counts days or weeks in a row, in each person's own time zone."
        actions={
          <AdminOnly>
            <Button variant="primary" size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              New streak
            </Button>
          </AdminOnly>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          Streaks couldn&apos;t load.{' '}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {!streaks && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {streaks?.length === 0 && (
        <EmptyState
          icon={Flame}
          title="No streaks yet"
          description="Pick an event, such as a lesson finished or a workout logged, and reward people for doing it day after day."
          action={isAdminOrOwner ? { label: 'Create your first streak', onClick: startCreate } : undefined}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {streaks?.map((streak) => (
          <Card key={streak.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Flame className="h-4 w-4 text-brand-400" />
                    <h2 className="truncate font-semibold text-zinc-100">{streak.name}</h2>
                    <Badge variant={streak.enabled ? 'emerald' : 'zinc'}>{streak.enabled ? 'On' : 'Paused'}</Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">{streak.key}</p>
                  {streak.description && <p className="mt-1 text-sm text-zinc-400">{streak.description}</p>}
                </div>
                <AdminOnly>
                  <Switch
                    checked={streak.enabled}
                    onChange={(e) => void toggle(streak, e.target.checked)}
                    aria-label={`${streak.name} is on`}
                  />
                </AdminOnly>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <dt>Counts when</dt>
                <dd className="font-mono text-zinc-200">{streak.triggerEvent}</dd>
                <dt>How often</dt>
                <dd className="text-zinc-200">{streak.cadence === 'weekly' ? 'Every week' : 'Every day'}</dd>
                <dt>Default time zone</dt>
                <dd className="text-zinc-200">{streak.timeZone}</dd>
                <dt>Freezes</dt>
                <dd className="flex items-center gap-1 text-zinc-200">
                  {streak.freezeEvery > 0 ? (
                    <>
                      <Snowflake className="h-3 w-3 text-info-400" />1 every {streak.freezeEvery}, hold up to {streak.maxFreezes}
                    </>
                  ) : (
                    'Off'
                  )}
                </dd>
              </dl>

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                <Button variant="outline" size="sm" onClick={() => setLeadersFor(leadersFor === streak.id ? null : streak.id)}>
                  {leadersFor === streak.id ? 'Hide leaders' : 'Longest running'}
                </Button>
                <Link href={`/dashboard/rules?trigger=streak_updated`}>
                  <Button variant="ghost" size="sm" title="Create a rule that reacts when this streak changes">
                    <Zap className="h-3.5 w-3.5" />
                    Reward milestones
                  </Button>
                </Link>
                <AdminOnly>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(streak)} aria-label={`Edit ${streak.name}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(streak)} aria-label={`Delete ${streak.name}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger-400" />
                    </Button>
                  </div>
                </AdminOnly>
              </div>

              {leadersFor === streak.id && (
                <div className="border-t border-zinc-800 pt-3">
                  {!leaders && <p className="text-xs text-zinc-400">Loading…</p>}
                  {leaders?.length === 0 && <p className="text-xs text-zinc-400">Nobody has a streak running right now.</p>}
                  <ol className="space-y-1.5 text-sm">
                    {leaders?.map((leader, index) => (
                      <li key={leader.userId} className="flex items-center gap-3">
                        <span className="w-5 text-xs text-zinc-500">{index + 1}</span>
                        <Link href={`/dashboard/users/${leader.userId}?tab=streaks`} className="min-w-0 flex-1 truncate text-zinc-200 hover:underline">
                          {leader.name || leader.externalId}
                        </Link>
                        {leader.atRisk && <Badge variant="amber">At risk</Badge>}
                        <span className="font-bold text-brand-400">
                          {leader.current}
                          <span className="ml-1 text-xs font-normal text-zinc-400">{streak.cadence === 'weekly' ? 'wk' : 'd'}</span>
                        </span>
                        {leader.lastActivityAt && (
                          <span className="hidden text-xs text-zinc-500 sm:block">{formatRelativeTime(leader.lastActivityAt)}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New streak'}
        description="Choose the event that counts, and how forgiving the streak should be."
      >
        <form onSubmit={save} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Daily lesson" required />
            <Input
              label="Key *"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="daily_lesson"
              disabled={Boolean(editing)}
              helperText={editing ? 'The key can’t change once the streak exists.' : 'Letters, numbers, dashes and underscores.'}
              required
            />
          </div>

          <Input
            label="Counts when this event arrives *"
            value={form.triggerEvent}
            onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}
            placeholder="lesson_completed"
            disabled={Boolean(editing)}
            helperText={editing ? 'The event can’t change once the streak exists.' : 'The same event name you send from your app.'}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">How often</span>
              <Dropdown
                options={CADENCE_OPTIONS}
                value={form.cadence}
                onChange={(val) => setForm({ ...form, cadence: val as 'daily' | 'weekly' })}
                disabled={Boolean(editing)}
              />
            </div>
            <Input
              label="Default time zone"
              value={form.timeZone}
              onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              list="streak-time-zones"
              helperText="Used for people with none of their own. Send payload.timezone or set metadata.timezone to override it."
            />
            <datalist id="streak-time-zones">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Earn a freeze every N ${unit}`}
              type="number"
              min={0}
              max={365}
              value={form.freezeEvery}
              onChange={(e) => setForm({ ...form, freezeEvery: e.target.value })}
              helperText="0 turns freezes off. A freeze quietly covers one missed period."
            />
            <Input
              label="Most freezes a person can hold"
              type="number"
              min={0}
              max={30}
              value={form.maxFreezes}
              onChange={(e) => setForm({ ...form, maxFreezes: e.target.value })}
            />
          </div>

          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Finish one lesson a day"
            rows={2}
          />

          <div className="flex items-center justify-between border border-zinc-800 p-3">
            <div>
              <div className="text-sm text-zinc-200">Counting</div>
              <div className="text-xs text-zinc-400">Paused streaks keep their progress but stop counting.</div>
            </div>
            <Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} aria-label="Counting" />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              {editing ? 'Save changes' : 'Create streak'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
