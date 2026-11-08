'use client';

import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checklist } from '@/components/ui/checklist';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EVENT_CHECKLIST_ITEMS } from './integration-constants';

export type WebhookProvider = 'slack' | 'teams' | 'http';

export const PROVIDER_INFO: Record<WebhookProvider, { label: string; blurb: string; urlLabel: string; placeholder: string; help: string }> = {
  slack: {
    label: 'Slack',
    blurb: 'Post XP awards, badges, level-ups and finished challenges to a Slack channel.',
    urlLabel: 'Slack incoming webhook URL',
    placeholder: 'https://hooks.slack.com/services/T000/B000/XXXX',
    help: 'In Slack, create an app, turn on Incoming Webhooks, and add one to the channel you want.',
  },
  teams: {
    label: 'Microsoft Teams',
    blurb: 'Post the same updates to a Teams channel as cards, through a Workflows webhook.',
    urlLabel: 'Teams workflow webhook URL',
    placeholder: 'https://prod-00.westus.logic.azure.com/workflows/…',
    help: 'In Teams, add the “Post to a channel when a webhook request is received” workflow and copy its URL.',
  },
  http: {
    label: 'Webhook (any URL)',
    blurb: 'Send each update as JSON to any HTTPS address, for tools without a built-in integration. Requests can be signed.',
    urlLabel: 'HTTPS URL',
    placeholder: 'https://example.com/hooks/gami',
    help: 'The address must be public. Addresses on private networks are refused.',
  },
};

interface Props {
  provider: WebhookProvider | null;
  projectId: string;
  onClose: () => void;
  onConnected: () => void;
}

/** Connects Slack, Teams or a plain HTTPS endpoint. They differ only in the address they accept. */
export function ConnectWebhookDialog({ provider, projectId, onClose, onConnected }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(EVENT_CHECKLIST_ITEMS.map((item) => item.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    setName(`${PROVIDER_INFO[provider].label} notifications`);
    setUrl('');
    setSecret('');
    setEvents(EVENT_CHECKLIST_ITEMS.map((item) => item.value));
    setError(null);
  }, [provider]);

  if (!provider) return null;
  const info = PROVIDER_INFO[provider];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (events.length === 0) {
      setError('Choose at least one thing to send.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/integrations`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          provider,
          webhookUrl: url.trim(),
          enabledEvents: events,
          ...(provider === 'http' && secret ? { signingSecret: secret } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'It could not be connected.');
      onConnected();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be connected.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog isOpen onClose={onClose} title={`Connect ${info.label}`} description={info.blurb}>
      <form onSubmit={submit} className="space-y-4 text-xs">
        {error && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-danger-300">{error}</div>}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label={info.urlLabel} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={info.placeholder} helperText={info.help} required />
        {provider === 'http' && (
          <Input
            label="Signing secret (optional)"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            minLength={8}
            autoComplete="off"
            helperText="If set, each request carries X-Gami-Signature headers, the same as webhooks, so you can check it came from here."
          />
        )}
        <div>
          <span className="mb-1 block font-semibold text-zinc-300">Send updates for</span>
          <Checklist items={EVENT_CHECKLIST_ITEMS} selectedValues={events} onChange={setEvents} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={saving}>
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface EventsProps {
  open: boolean;
  integration: { id: string; name: string; config?: { enabledEvents?: string[] } } | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Choosing which updates an integration without templates receives. */
export function EventsDialog({ open, integration, projectId, onClose, onSaved }: EventsProps) {
  const [events, setEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(integration?.config?.enabledEvents ?? EVENT_CHECKLIST_ITEMS.map((item) => item.value));
    setError(null);
  }, [integration]);

  if (!open || !integration) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/integrations/${integration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabledEvents: events }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The change could not be saved.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog isOpen onClose={onClose} title={`Updates sent to ${integration.name}`} description="Turn off anything that would be noise in that channel.">
      <div className="space-y-4 text-xs">
        {error && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-danger-300">{error}</div>}
        <Checklist items={EVENT_CHECKLIST_ITEMS} selectedValues={events} onChange={setEvents} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" isLoading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
