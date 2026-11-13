'use client';

/**
 * Shown across the top of a live demo: when it will be deleted, a button that sends a burst of
 * events so boards and toasts move, and a way to install Gami.Fied for real.
 */
import { useEffect, useState } from 'react';
import { Clock, Download, FileDown, Radio } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useDashboard } from '../features/context/dashboard-context';

function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function DemoBanner() {
  const { selectedOrg, selectedProject } = useDashboard();
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; text?: string }>({ kind: 'idle' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!selectedOrg?.demoExpiresAt) return null;
  const expiresAt = selectedOrg.demoExpiresAt;

  const sendTraffic = async () => {
    setState({ kind: 'sending' });
    try {
      const res = await apiFetch('/api/demo/traffic', { method: 'POST', body: '{}' });
      const body = (await res.json().catch(() => ({}))) as { sent?: number; message?: string };
      if (!res.ok) return setState({ kind: 'error', text: body.message ?? 'Could not send traffic.' });
      setState({ kind: 'sent', text: `${body.sent} lessons sent. Watch the leaderboard and the activity feed.` });
    } catch {
      setState({ kind: 'error', text: 'Could not send traffic.' });
    }
  };

  return (
    <div className="border-b border-brand-800/50 bg-brand-950/40 px-4 py-2.5 text-xs text-brand-100 sm:px-6" role="region" aria-label="Live demo">
      <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Clock className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
          Live demo
        </span>
        <span className="text-brand-200/80">
          Everything here is deleted in <time dateTime={expiresAt}>{timeLeft(expiresAt, now)}</time>. Email, webhooks and integrations are off.
        </span>
        {state.text && (
          <span className={state.kind === 'error' ? 'text-danger-300' : 'text-success-300'} role="status">
            {state.text}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sendTraffic()}
            disabled={state.kind === 'sending'}
            className="inline-flex items-center gap-1.5 bg-brand-500 px-2.5 py-1 font-semibold text-on-accent transition-colors hover:bg-brand-400 disabled:opacity-60"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {state.kind === 'sending' ? 'Sending…' : 'Send traffic'}
          </button>
          {selectedProject && (
            // The demo's design as a file, to import into your own install (WEB-30).
            <a
              href={`/api/projects/${selectedProject.id}/design`}
              download
              className="inline-flex items-center gap-1.5 border border-brand-700/60 px-2.5 py-1 font-semibold text-brand-100 transition-colors hover:border-brand-500"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              Keep this setup
            </a>
          )}
          <a
            href="https://gami.fied.cc/docs/install/docker-compose/"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 border border-brand-700/60 px-2.5 py-1 font-semibold text-brand-100 transition-colors hover:border-brand-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Install your own
          </a>
        </span>
      </div>
    </div>
  );
}
