'use client';

import '@gami.fied/react/styles.css';
import { BadgeGrid, ChallengeList, GamiProvider, Leaderboard, LevelProgress, NotificationFeed } from '@gami.fied/react';
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { usePublicApiUrl } from '@/hooks/use-public-api-url';
import { CardSkeleton } from '@/components/ui/skeleton';

/** A new token is fetched a little before the old one runs out. */
const REFRESH_MS = 8 * 60_000;

/**
 * Shows this player what your app would show them: the ready-made React components, fed by a
 * read-only token for this one player. It is the real `/v1/me` API, so what appears here is what
 * the player's own browser would get.
 */
export function UserPreview({ base }: { base: string }) {
  const baseUrl = usePublicApiUrl();
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${base}/preview-token`, { method: 'POST' });
      if (!res.ok) throw new Error('refused');
      setToken(((await res.json()) as { token: string }).token);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [base]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (failed) {
    return (
      <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
        The preview couldn&apos;t load.{' '}
        <button className="underline" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!token || !baseUrl) return <CardSkeleton />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        This is what the player sees through the ready-made React components, using a read-only token for them alone. Change a rule, a
        level or a badge, and reopen this tab to see the difference.
      </p>
      <GamiProvider key={token} endUserToken={token} baseUrl={baseUrl} live={false}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <PreviewCard title="Level">
            <LevelProgress />
          </PreviewCard>
          <PreviewCard title="Leaderboard">
            <Leaderboard limit={5} />
          </PreviewCard>
          <PreviewCard title="Badges">
            <BadgeGrid />
          </PreviewCard>
          <PreviewCard title="Challenges">
            <ChallengeList />
          </PreviewCard>
          <PreviewCard title="Notifications">
            <NotificationFeed limit={5} />
          </PreviewCard>
        </div>
      </GamiProvider>
    </div>
  );
}

function PreviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}
