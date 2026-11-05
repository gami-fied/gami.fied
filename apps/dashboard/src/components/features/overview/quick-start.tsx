'use client';

import { usePublicApiUrl } from '@/hooks/use-public-api-url';
import { apiFetch } from '@/lib/api-client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { PROJECT_TEMPLATES, ProjectTemplate } from '@/lib/project-templates';

const TEST_USER = 'quick_start_user';
const POLL_ATTEMPTS = 15;
const POLL_DELAY_MS = 2000;

async function post(url: string, body: object): Promise<Response> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Request failed');
  }
  return res;
}

export function QuickStart({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const toast = useToast();
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [xp, setXp] = useState<number | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  const apiUrl = usePublicApiUrl();
  const base = `/api/projects/${projectId}`;

  const applyTemplate = async (choice: ProjectTemplate) => {
    setBusy(true);
    try {
      await post(`${base}/achievements`, choice.achievement);
      await post(`${base}/rules`, {
        name: `${choice.name} reward`,
        trigger: choice.event,
        actions: [
          { type: 'award_xp', params: { amount: choice.xp } },
          { type: 'award_achievement', params: { achievementKey: choice.achievement.key } },
        ],
      });
      const key = await post(`${base}/api-keys`, { name: 'Quick start', scopes: ['events:write'] });
      const data = await key.json();
      setApiKey(data.rawSecret ?? data.key ?? null);
      setTemplate(choice);
    } catch (err: unknown) {
      toast.error('Could not set up the project', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const readXp = async (): Promise<number | null> => {
    const res = await apiFetch(`${base}/users/${TEST_USER}/xp`).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json()).totalXp ?? null;
  };

  const sendTestEvent = async () => {
    if (!template) return;
    setBusy(true);
    setWaitedTooLong(false);
    try {
      const before = (await readXp()) ?? 0;
      await post(`${base}/events/test`, {
        event: template.event,
        user_id: TEST_USER,
        payload: template.samplePayload,
      });

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        const current = await readXp();
        if (current !== null && current > before) {
          setXp(current);
          return;
        }
      }
      setWaitedTooLong(true);
    } catch (err: unknown) {
      toast.error('Could not send the event', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const curl = template
    ? `curl -X POST ${apiUrl}/v1/events \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey ?? 'YOUR_API_KEY'}" \\
  -d '${JSON.stringify({ event: template.event, user_id: 'user_123', payload: template.samplePayload })}'`
    : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick start</CardTitle>
        <CardDescription>Go from nothing to a user earning XP in about a minute.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!template && (
          <>
            <p className="text-sm text-zinc-300">1. Pick a starting point for your first rule.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROJECT_TEMPLATES.map((choice) => (
                <button
                  key={choice.id}
                  disabled={busy}
                  onClick={() => applyTemplate(choice)}
                  className="border border-zinc-800 p-4 text-left hover:border-brand-500 disabled:opacity-50"
                >
                  <span className="block text-sm font-semibold text-zinc-100">{choice.name}</span>
                  <span className="block text-xs text-zinc-400 mt-1">{choice.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {template && (
          <>
            <p className="text-sm text-zinc-300">
              2. Your <strong>{template.event}</strong> rule awards {template.xp} XP and the{' '}
              {template.achievement.name} badge. Here&apos;s your API key, shown only once, in a
              sample request.
            </p>
            <pre className="overflow-x-auto bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-200">
              <code>{curl}</code>
            </pre>

            <p className="text-sm text-zinc-300">3. Send a test event and watch it work.</p>
            <Button onClick={sendTestEvent} isLoading={busy}>
              Send test event
            </Button>

            {xp !== null && (
              <p role="status" className="text-sm text-success-300">
                It worked: <strong>{TEST_USER}</strong> now has {xp} XP.
              </p>
            )}
            {waitedTooLong && (
              <p role="alert" className="text-sm text-warning-300">
                No XP after 30 seconds. Check that the worker is running on the System page.
              </p>
            )}
            {xp !== null && (
              <Button variant="secondary" onClick={onDone}>
                Finish
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
