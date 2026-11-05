'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface FailedEvent {
  eventId: string;
  type: string;
  attempts: number;
  lastError: string | null;
}

/** Only appears when events have run out of retries. */
export function FailedEventsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [failed, setFailed] = useState<FailedEvent[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/projects/${projectId}/events/dead-letter`).catch(() => null);
    if (res?.ok) setFailed((await res.json()).data);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replay = async (eventId: string) => {
    const res = await apiFetch(`/api/projects/${projectId}/events/${eventId}/replay`, {
      method: 'POST',
    }).catch(() => null);
    if (res?.ok) {
      toast.success('Event queued for replay');
      await load();
    } else {
      toast.error('Could not replay the event');
    }
  };

  if (failed.length === 0) return null;

  return (
    <section className="border border-danger-800 bg-danger-950/20 p-4" aria-label="Failed events">
      <h2 className="text-sm font-bold text-danger-200">
        {failed.length} {failed.length === 1 ? 'event' : 'events'} failed to process
      </h2>
      <ul className="mt-3 space-y-2">
        {failed.map((event) => (
          <li key={event.eventId} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="text-zinc-100">{event.type}</span>
              <span className="block truncate text-xs text-zinc-400">
                {event.lastError ?? 'Unknown error'}
              </span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => replay(event.eventId)}>
              Replay
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
