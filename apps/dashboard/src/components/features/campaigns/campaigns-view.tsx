'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
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
import { usePermissions } from '@/hooks/use-permissions';
import { Edit2, Mail, Trash2 } from 'lucide-react';

type Kind = 'streak_reminder' | 'weekly_recap' | 'winback';

interface Campaign {
  id: string;
  name: string;
  kind: Kind;
  enabled: boolean;
  subject: string;
  body: string;
  config: Record<string, number | string>;
  sentLastWeek: number;
  sentTotal: number;
}

interface TemplateInfo {
  kind: Kind;
  defaults: { name: string; subject: string; body: string; config: Record<string, number | string> };
  variables: { name: string; description: string; example: string }[];
}

interface StreakOption {
  key: string;
  name: string;
}

const KIND_LABELS: Record<Kind, { label: string; hint: string }> = {
  streak_reminder: { label: 'Streak reminder', hint: 'Nudges people who are about to lose a streak' },
  weekly_recap: { label: 'Weekly recap', hint: 'Summarises each active person’s week' },
  winback: { label: 'Win-back', hint: 'Brings back people who stopped coming' },
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, index) => ({
  value: String(index),
  label,
}));

function describeTiming(campaign: Campaign): string {
  const config = campaign.config;
  if (campaign.kind === 'streak_reminder') return `After ${config['sendAfterHour'] ?? 18}:00 their time, if the "${config['streak']}" streak is at risk`;
  if (campaign.kind === 'weekly_recap') return `${WEEKDAYS[Number(config['weekday'] ?? 0)]?.label} at ${String(config['hour'] ?? 9).padStart(2, '0')}:00 UTC`;
  return `After ${config['inactiveDays'] ?? 14} days away, up to ${config['maxDays'] ?? 90} days`;
}

export function CampaignsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [streaks, setStreaks] = useState<StreakOption[]>([]);
  const [error, setError] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [kind, setKind] = useState<Kind>('streak_reminder');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [config, setConfig] = useState<Record<string, number | string>>({});
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; htmlBody: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const [list, tpl, streakList] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/campaigns`),
        apiFetch(`/api/projects/${projectId}/campaigns/templates`),
        apiFetch(`/api/projects/${projectId}/streaks`),
      ]);
      if (!list.ok || !tpl.ok) throw new Error('failed');
      setCampaigns((await list.json()).data);
      setTemplates((await tpl.json()).data);
      if (streakList.ok) setStreaks((await streakList.json()).data);
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setCampaigns(null);
    void load();
  }, [load]);

  // A preview of the email as it is being edited, a moment after typing stops.
  useEffect(() => {
    if (!open || !projectId) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/campaigns/preview`, {
          method: 'POST',
          body: JSON.stringify({ kind, subject, body }),
        });
        const result = await res.json();
        if (res.ok) {
          setPreview(result);
          setPreviewError(null);
        } else {
          setPreviewError(result.message ?? 'The preview could not be made.');
        }
      } catch {
        setPreviewError('The preview could not be made.');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [open, projectId, kind, subject, body]);

  const template = templates.find((item) => item.kind === kind);

  const startCreate = (nextKind: Kind) => {
    const info = templates.find((item) => item.kind === nextKind);
    setEditing(null);
    setKind(nextKind);
    setName(info?.defaults.name ?? '');
    setSubject(info?.defaults.subject ?? '');
    setBody(info?.defaults.body ?? '');
    setConfig({ ...(info?.defaults.config ?? {}), ...(nextKind === 'streak_reminder' ? { streak: streaks[0]?.key ?? '' } : {}) });
    setEnabled(false);
    setFormError(null);
    setPreview(null);
    setOpen(true);
  };

  const startEdit = (campaign: Campaign) => {
    setEditing(campaign);
    setKind(campaign.kind);
    setName(campaign.name);
    setSubject(campaign.subject);
    setBody(campaign.body);
    setConfig(campaign.config);
    setEnabled(campaign.enabled);
    setFormError(null);
    setPreview(null);
    setOpen(true);
  };

  const insertVariable = (variable: string) => {
    const field = bodyRef.current;
    const token = `{{${variable}}}`;
    if (!field) return setBody((current) => current + token);
    const start = field.selectionStart ?? body.length;
    const end = field.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(
        editing ? `/api/projects/${projectId}/campaigns/${editing.id}` : `/api/projects/${projectId}/campaigns`,
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(editing ? { name, subject, body, config, enabled } : { kind, name, subject, body, config, enabled }),
        }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The campaign could not be saved.');
      toast.success(editing ? 'Campaign saved.' : 'Campaign created.');
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The campaign could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (campaign: Campaign, next: boolean) => {
    if (!projectId) return;
    setCampaigns((current) => current?.map((item) => (item.id === campaign.id ? { ...item, enabled: next } : item)) ?? null);
    const res = await apiFetch(`/api/projects/${projectId}/campaigns/${campaign.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) });
    if (!res.ok) {
      toast.error('The change could not be saved.');
      void load();
    }
  };

  const remove = async (campaign: Campaign) => {
    if (!projectId) return;
    const ok = await confirm({
      title: `Delete "${campaign.name}"?`,
      message: 'It stops sending and its history is removed. Emails already queued are still delivered.',
      confirmText: 'Delete campaign',
      isDanger: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/campaigns/${campaign.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Campaign deleted.');
      void load();
    } else {
      toast.error('The campaign could not be deleted.');
    }
  };

  const setNumber = (key: string, value: string) => setConfig((current) => ({ ...current, [key]: value === '' ? '' : Number(value) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Emails that send themselves: streak reminders, weekly recaps and win-back notes. People who unsubscribe are never emailed."
        actions={
          <AdminOnly>
            <Dropdown
              options={(Object.keys(KIND_LABELS) as Kind[]).map((value) => ({ value, label: KIND_LABELS[value].label, sublabel: KIND_LABELS[value].hint }))}
              value=""
              placeholder="New campaign"
              onChange={(value) => startCreate(value as Kind)}
            />
          </AdminOnly>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          Campaigns couldn&apos;t load.{' '}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!campaigns && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}
      {campaigns?.length === 0 && (
        <EmptyState
          icon={Mail}
          title="No campaigns yet"
          description="Start with a streak reminder or a weekly recap. They need email set up in Settings, and each person can unsubscribe."
          action={isAdminOrOwner ? { label: 'Create a weekly recap', onClick: () => startCreate('weekly_recap') } : undefined}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {campaigns?.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-zinc-100">{campaign.name}</h2>
                    <Badge variant={campaign.enabled ? 'emerald' : 'zinc'}>{campaign.enabled ? 'Sending' : 'Off'}</Badge>
                    <Badge variant="blue">{KIND_LABELS[campaign.kind].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{describeTiming(campaign)}</p>
                </div>
                <AdminOnly>
                  <Switch checked={campaign.enabled} onChange={(e) => void toggle(campaign, e.target.checked)} aria-label={`${campaign.name} is sending`} />
                </AdminOnly>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                <div className="font-semibold text-zinc-200">{campaign.subject}</div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-zinc-400">{campaign.body}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {campaign.sentLastWeek} sent this week · {campaign.sentTotal} in total
                </span>
                <AdminOnly>
                  <span className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(campaign)} aria-label={`Edit ${campaign.name}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(campaign)} aria-label={`Delete ${campaign.name}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger-400" />
                    </Button>
                  </span>
                </AdminOnly>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : `New ${KIND_LABELS[kind].label.toLowerCase()}`}
        description={KIND_LABELS[kind].hint}
      >
        <form onSubmit={save} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}

          <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required />

          {kind === 'streak_reminder' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Streak</span>
                {streaks.length === 0 ? (
                  <p className="text-xs text-warning-300">Create a streak first, on the Streaks page.</p>
                ) : (
                  <Dropdown
                    options={streaks.map((item) => ({ value: item.key, label: item.name, sublabel: item.key }))}
                    value={String(config['streak'] ?? '')}
                    onChange={(value) => setConfig({ ...config, streak: value })}
                  />
                )}
              </div>
              <Input
                label="Send after (their local hour)"
                type="number"
                min={0}
                max={23}
                value={String(config['sendAfterHour'] ?? 18)}
                onChange={(e) => setNumber('sendAfterHour', e.target.value)}
                helperText="Only if they haven’t done it yet that day or week."
              />
            </div>
          )}

          {kind === 'weekly_recap' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Day</span>
                <Dropdown options={WEEKDAYS} value={String(config['weekday'] ?? 0)} onChange={(value) => setConfig({ ...config, weekday: Number(value) })} />
              </div>
              <Input label="Hour (UTC)" type="number" min={0} max={23} value={String(config['hour'] ?? 9)} onChange={(e) => setNumber('hour', e.target.value)} />
            </div>
          )}

          {kind === 'winback' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Send after this many days away"
                type="number"
                min={1}
                value={String(config['inactiveDays'] ?? 14)}
                onChange={(e) => setNumber('inactiveDays', e.target.value)}
              />
              <Input
                label="Stop trying after (days)"
                type="number"
                min={2}
                value={String(config['maxDays'] ?? 90)}
                onChange={(e) => setNumber('maxDays', e.target.value)}
              />
            </div>
          )}

          <Input label="Subject *" value={subject} onChange={(e) => setSubject(e.target.value)} required />

          <div>
            <Textarea ref={bodyRef} label="Message *" value={body} onChange={(e) => setBody(e.target.value)} rows={7} required />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-500">Add:</span>
              {template?.variables.map((variable) => (
                <button
                  key={variable.name}
                  type="button"
                  onClick={() => insertVariable(variable.name)}
                  title={`${variable.description}. For example: ${variable.example}`}
                  className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  {`{{${variable.name}}}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-zinc-300">Preview with example values</span>
            {previewError ? (
              <p className="text-xs text-warning-300">{previewError}</p>
            ) : preview ? (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-200">{preview.subject}</div>
                <iframe title="Email preview" srcDoc={preview.htmlBody} sandbox="" className="h-64 w-full border border-zinc-800 bg-zinc-950" />
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Preparing the preview…</p>
            )}
          </div>

          <div className="flex items-center justify-between border border-zinc-800 p-3">
            <div>
              <div className="text-sm text-zinc-200">Sending</div>
              <div className="text-xs text-zinc-400">Turn on when you’re happy with the message and timing.</div>
            </div>
            <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label="Sending" />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              {editing ? 'Save changes' : 'Create campaign'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
