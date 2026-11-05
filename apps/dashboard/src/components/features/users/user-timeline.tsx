'use client';

import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelineEntry {
  id: string;
  kind: 'event' | 'rule' | 'xp' | 'achievement';
  title: string;
  detail: string | null;
  at: string;
}

const KIND_LABELS: Record<TimelineEntry['kind'], string> = {
  event: 'Event',
  rule: 'Rule',
  xp: 'XP',
  achievement: 'Badge',
};

export function UserTimeline({ projectId, userId }: { projectId: string; userId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setEntries(null);
    setFailed(false);
    apiFetch(`/api/projects/${projectId}/users/${userId}/timeline`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => setEntries(body.data))
      .catch(() => setFailed(true));
  }, [projectId, userId]);

  return (
    <section aria-label="User timeline">
      <h3 className="text-sm font-semibold text-zinc-200 mb-2">Timeline</h3>
      {failed && <p className="text-sm text-danger-300">The timeline couldn&apos;t load.</p>}
      {!failed && !entries && <Skeleton className="h-24 w-full" />}
      {entries?.length === 0 && <p className="text-sm text-zinc-400">Nothing yet.</p>}
      <ol className="space-y-1.5">
        {entries?.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="flex gap-3 text-sm">
            <span className="w-12 shrink-0 text-xs text-zinc-400">{KIND_LABELS[entry.kind]}</span>
            <span className="min-w-0 flex-1 text-zinc-200">
              {entry.title}
              {entry.detail && (
                <span className="block truncate text-xs text-zinc-400">{entry.detail}</span>
              )}
            </span>
            <time className="shrink-0 text-xs text-zinc-400" dateTime={entry.at}>
              {formatDateTime(entry.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
