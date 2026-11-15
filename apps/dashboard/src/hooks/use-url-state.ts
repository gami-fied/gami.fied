import { useCallback, useEffect, useState } from 'react';

type Update<T> = T | ((current: T) => T);

/**
 * `useState` whose value is also kept in the address bar, so a filter, a search or a page number
 * survives a refresh and can be sent to someone as a link. The default is left out of the address.
 */
export function useUrlState<T extends string | number>(key: string, initial: T): [T, (update: Update<T>) => void] {
  const [value, setValue] = useState<T>(initial);

  // Read after the first render, so the server's HTML and the browser's first render agree.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(key);
    if (raw === null) return;
    if (typeof initial === 'number') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) setValue(parsed as T);
    } else {
      setValue(raw as T);
    }
    // Only the address at first load matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (update: Update<T>) => {
      setValue((current) => {
        const next = typeof update === 'function' ? (update as (current: T) => T)(current) : update;
        const url = new URL(window.location.href);
        if (next === initial || next === '') url.searchParams.delete(key);
        else url.searchParams.set(key, String(next));
        window.history.replaceState(window.history.state, '', url);
        return next;
      });
    },
    [key, initial]
  );

  return [value, set];
}
