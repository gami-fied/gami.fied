'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePublicApiUrl } from '@/hooks/use-public-api-url';
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Copy, Plug, Plus, RefreshCw, Trash2 } from 'lucide-react';

type ConnectorType = 'segment' | 'rudderstack' | 'stripe' | 'github';

interface Connector {
  id: string;
  type: ConnectorType;
  name: string;
  enabled: boolean;
  settings: { userMetadataKey?: string; includeAnonymous?: boolean; allowedEvents?: string[] };
  receivedCount: number;
  lastReceivedAt: string | null;
  lastError: string | null;
  path: string;
}

const TYPES: { value: ConnectorType; label: string; sublabel: string }[] = [
  { value: 'segment', label: 'Segment', sublabel: 'Track and identify calls, from a Webhooks destination' },
  { value: 'rudderstack', label: 'RudderStack', sublabel: 'Track and identify calls, from a Webhook destination' },
  { value: 'stripe', label: 'Stripe', sublabel: 'Payments and subscriptions, such as invoice.paid' },
  { value: 'github', label: 'GitHub', sublabel: 'Pushes, pull requests and reviews' },
];

const HOW: Record<ConnectorType, string> = {
  segment: 'In Segment, add a Webhooks destination with this URL, and a header “Authorization: Bearer <secret>”. Track calls become events named like order_completed; identify calls fill in names, emails and metadata.',
  rudderstack: 'In RudderStack, add a Webhook destination with this URL, and a header “Authorization: Bearer <secret>”. Track calls become events; identify calls fill in profiles.',
  stripe: 'In Stripe, add a webhook endpoint with this URL and choose the events you want, then paste its signing secret here. Put your user ID in the customer or payment metadata as gami_user_id, or the Stripe customer ID is used. Events arrive as stripe.invoice.paid and so on, with amount in the main currency unit.',
  github: 'In GitHub, add a webhook with this URL, content type application/json, and a secret of your choice that you also paste here. Events arrive as github.push, github.pull_request.merged and so on, for the GitHub user who did it.',
};

export function ConnectorsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const apiUrl = usePublicApiUrl();

  const [list, setList] = useState<Connector[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ConnectorType>('segment');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [metadataKey, setMetadataKey] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [allowed, setAllowed] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<{ name: string; url: string; secret: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/connectors`);
      if (!res.ok) throw new Error('failed');
      setList((await res.json()).data);
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setList(null);
    void load();
  }, [load]);

  const urlOf = (connector: Pick<Connector, 'path'>) => `${apiUrl}${connector.path}`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied.');
    } catch {
      toast.error('Copy it by hand.');
    }
  };

  const openDialog = () => {
    setType('segment');
    setName('');
    setSecret('');
    setMetadataKey('');
    setAnonymous(false);
    setAllowed('');
    setFormError(null);
    setOpen(true);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const settings: Connector['settings'] = {};
      if (type === 'stripe' && metadataKey.trim()) settings.userMetadataKey = metadataKey.trim();
      if ((type === 'segment' || type === 'rudderstack') && anonymous) settings.includeAnonymous = true;
      const events = allowed.split(',').map((item) => item.trim()).filter(Boolean);
      if (events.length) settings.allowedEvents = events;
      const res = await apiFetch(`/api/projects/${projectId}/connectors`, {
        method: 'POST',
        body: JSON.stringify({ type, name: name.trim() || TYPES.find((item) => item.value === type)!.label, settings, ...(secret.trim() ? { secret: secret.trim() } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'The connector could not be created.');
      setOpen(false);
      setShown({ name: body.name, url: urlOf(body), secret: body.secret ?? null });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The connector could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (connector: Connector, enabled: boolean) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/connectors/${connector.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error('The change could not be saved.');
    await load();
  };

  const rotate = async (connector: Connector) => {
    if (!projectId) return;
    const ok = await confirm({ title: 'Make a new secret?', message: 'The old one stops working at once, so update the sender straight after.', confirmText: 'Make a new secret', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/connectors/${connector.id}/rotate`, { method: 'POST', body: JSON.stringify({}) });
    const body = await res.json();
    if (!res.ok) return toast.error(body.message ?? 'It could not be changed.');
    setShown({ name: connector.name, url: urlOf(connector), secret: body.secret });
  };

  const remove = async (connector: Connector) => {
    if (!projectId) return;
    const ok = await confirm({ title: `Delete “${connector.name}”?`, message: 'Anything still sending to it will get an error. Events already received stay.', confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/connectors/${connector.id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error('It could not be deleted.');
    await load();
  };

  const signs = type === 'stripe' || type === 'github';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connectors"
        description="Receive events from the tools you already use, without writing code."
        actions={
          <Button variant="primary" size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            New connector
          </Button>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!list && !error && <CardSkeleton />}
      {list && list.length === 0 && <EmptyState icon={Plug} title="No connectors yet" description="Connect Segment, RudderStack, Stripe or GitHub, and their events start running your rules." action={{ label: 'Add a connector', onClick: openDialog }} />}

      {list && list.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((connector) => (
            <Card key={connector.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-zinc-100">{connector.name}</h2>
                      <Badge variant="zinc">{TYPES.find((item) => item.value === connector.type)?.label}</Badge>
                      <Badge variant={connector.enabled ? 'emerald' : 'zinc'}>{connector.enabled ? 'On' : 'Off'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400" title={connector.lastReceivedAt ? formatDateTime(connector.lastReceivedAt) : undefined}>
                      {connector.receivedCount.toLocaleString()} received{connector.lastReceivedAt ? `, last ${formatRelativeTime(connector.lastReceivedAt)}` : ', nothing yet'}
                    </p>
                    {connector.lastError && <p className="mt-1 text-xs text-warning-300">{connector.lastError}</p>}
                    {connector.settings.allowedEvents?.length ? <p className="mt-1 text-xs text-zinc-500">Only {connector.settings.allowedEvents.join(', ')}</p> : null}
                  </div>
                  <Switch checked={connector.enabled} onChange={(e) => void toggle(connector, e.target.checked)} aria-label={`${connector.name} is on`} />
                </div>
                <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate text-xs text-zinc-300">{urlOf(connector)}</code>
                  <Button variant="ghost" size="sm" onClick={() => void copy(urlOf(connector))} aria-label="Copy the URL"><Copy className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="flex justify-end gap-1">
                  {(connector.type === 'segment' || connector.type === 'rudderstack') && (
                    <Button variant="ghost" size="sm" onClick={() => void rotate(connector)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      New secret
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void remove(connector)} aria-label={`Delete ${connector.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog isOpen={open} onClose={() => setOpen(false)} title="New connector" description="Events it receives are checked, turned into events here, and run your rules like any other.">
        <form onSubmit={create} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div>
            <span className="mb-1 block text-xs font-semibold text-zinc-300">Service</span>
            <Dropdown options={TYPES} value={type} onChange={(value) => setType(value as ConnectorType)} />
          </div>
          <p className="text-xs text-zinc-400">{HOW[type]}</p>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={TYPES.find((item) => item.value === type)!.label} />
          {signs && <Input label="Signing secret *" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={type === 'stripe' ? 'whsec_...' : 'The secret you set on the webhook'} required autoComplete="off" />}
          {type === 'stripe' && <Input label="Metadata key with your user ID" value={metadataKey} onChange={(e) => setMetadataKey(e.target.value)} placeholder="gami_user_id" />}
          {(type === 'segment' || type === 'rudderstack') && <Checkbox label="Include visitors who are not signed in" description="They are tracked by their anonymous ID, as separate users." checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />}
          <Input label="Only these events (optional)" value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder={type === 'stripe' ? 'stripe.invoice.paid' : type === 'github' ? 'github.pull_request.merged' : 'order_completed'} helperText="Comma separated, as they arrive here. Blank takes everything." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>Create connector</Button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={shown !== null} onClose={() => setShown(null)} title={`${shown?.name ?? ''} is ready`} description={shown?.secret ? 'Copy the secret now. It is not shown again.' : 'Point the service at this URL.'}>
        {shown && (
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">URL</span>
              <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <code className="min-w-0 flex-1 truncate text-xs text-zinc-300">{shown.url}</code>
                <Button variant="ghost" size="sm" onClick={() => void copy(shown.url)} aria-label="Copy the URL"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {shown.secret && (
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Secret</span>
                <div className="flex items-center gap-2 border border-warning-800/60 bg-warning-950/30 px-2 py-1.5">
                  <code className="min-w-0 flex-1 break-all text-xs text-warning-200">{shown.secret}</code>
                  <Button variant="ghost" size="sm" onClick={() => void copy(shown.secret!)} aria-label="Copy the secret"><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setShown(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
