'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Listens to a project's live stream and calls `onActivity` whenever something changes, so a page
 * can refetch instead of polling. It pauses while the tab is hidden and reconnects on its own.
 * Returns whether the stream is connected, for a "Live" indicator.
 */
export function useLiveUpdates(projectId: string | null, onActivity: () => void): boolean {
  const [live, setLive] = useState(false);
  const callback = useRef(onActivity);
  callback.current = onActivity;

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;

    const open = () => {
      if (source || document.hidden) return;
      source = new EventSource(`/api/projects/${projectId}/stream`, { withCredentials: true });
      source.addEventListener('ready', () => setLive(true));
      source.addEventListener('activity', () => callback.current());
      source.addEventListener('close', () => setLive(false));
      // EventSource retries on its own, so an error only means "not connected right now".
      source.onerror = () => setLive(false);
    };
    const close = () => {
      source?.close();
      source = null;
      setLive(false);
    };
    const onVisibility = () => {
      if (document.hidden) close();
      else {
        open();
        callback.current();
      }
    };

    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      close();
    };
  }, [projectId]);

  return live;
}
