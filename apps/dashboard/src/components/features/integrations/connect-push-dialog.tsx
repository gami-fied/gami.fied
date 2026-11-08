'use client';

import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checklist } from '@/components/ui/checklist';
import { Switch } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { EVENT_CHECKLIST_ITEMS } from './integration-constants';

export type PushProvider = 'fcm' | 'apns';

export const PUSH_INFO: Record<PushProvider, { label: string; blurb: string }> = {
  fcm: {
    label: 'Android push (Firebase)',
    blurb: 'Send push notifications to Android phones through Firebase Cloud Messaging.',
  },
  apns: {
    label: 'iPhone push (Apple)',
    blurb: 'Send push notifications to iPhones and iPads through Apple’s push service.',
  },
};

interface Props {
  provider: PushProvider | null;
  projectId: string;
  onClose: () => void;
  onConnected: () => void;
}

/** Reads a chosen file as text, so a key does not have to be pasted. */
function readFile(file: File | undefined, set: (text: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => set(String(reader.result ?? ''));
  reader.readAsText(file);
}

export function ConnectPushDialog({ provider, projectId, onClose, onConnected }: Props) {
  const [name, setName] = useState('');
  const [serviceAccount, setServiceAccount] = useState('');
  const [keyText, setKeyText] = useState('');
  const [keyId, setKeyId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [events, setEvents] = useState<string[]>(EVENT_CHECKLIST_ITEMS.map((item) => item.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    setName(PUSH_INFO[provider].label);
    setServiceAccount('');
    setKeyText('');
    setKeyId('');
    setTeamId('');
    setBundleId('');
    setSandbox(false);
    setEvents(EVENT_CHECKLIST_ITEMS.map((item) => item.value));
    setError(null);
  }, [provider]);

  if (!provider) return null;
  const info = PUSH_INFO[provider];

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
          enabledEvents: events,
          credentials:
            provider === 'fcm'
              ? serviceAccount.trim()
              : { privateKey: keyText.trim(), keyId: keyId.trim(), teamId: teamId.trim(), topic: bundleId.trim() },
          ...(provider === 'apns' ? { sandbox } : {}),
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

        {provider === 'fcm' ? (
          <div className="space-y-2">
            <Textarea
              label="Service account key (JSON)"
              value={serviceAccount}
              onChange={(e) => setServiceAccount(e.target.value)}
              rows={6}
              placeholder='{ "type": "service_account", "project_id": "…", … }'
              required
            />
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Choose the service account file"
              onChange={(e) => readFile(e.target.files?.[0], setServiceAccount)}
              className="text-zinc-400"
            />
            <p className="text-zinc-500">
              In Firebase, open Project settings, then Service accounts, and generate a new private key. It is stored encrypted and never shown again.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Team ID" value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="ABCDE12345" required />
              <Input label="Key ID" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="A1B2C3D4E5" required />
            </div>
            <Input label="App bundle ID" value={bundleId} onChange={(e) => setBundleId(e.target.value)} placeholder="com.example.app" required />
            <Textarea
              label="Key file contents (.p8)"
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              rows={5}
              placeholder="-----BEGIN PRIVATE KEY-----"
              required
            />
            <input
              type="file"
              accept=".p8,text/plain"
              aria-label="Choose the .p8 key file"
              onChange={(e) => readFile(e.target.files?.[0], setKeyText)}
              className="text-zinc-400"
            />
            <div className="flex items-center justify-between border border-zinc-800 p-3">
              <div>
                <div className="text-sm text-zinc-200">Sandbox</div>
                <div className="text-zinc-400">Use Apple’s test servers, for apps installed from Xcode or TestFlight builds.</div>
              </div>
              <Switch checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} aria-label="Sandbox" />
            </div>
          </div>
        )}

        <div>
          <span className="mb-1 block font-semibold text-zinc-300">Send a push for</span>
          <Checklist items={EVENT_CHECKLIST_ITEMS} selectedValues={events} onChange={setEvents} />
        </div>

        <p className="text-zinc-500">
          Phones appear once your app registers them with <code className="font-mono">POST /v1/me/devices</code>. See the push guide in the docs.
        </p>

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
