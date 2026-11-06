import { useCallback, useState } from 'react';
import type { SetStateAction } from 'react';
import { queryClient } from '@/lib/api-client';

const cacheKey = (key: string) => ['state', key];

export const hasCachedState = (key: string) => queryClient.getQueryData(cacheKey(key)) !== undefined;

/**
 * `useState` that outlives the page. Returning to a screen shows what it last had straight away,
 * while the hook refreshes it behind the scenes. Each key holds its own value, so switching
 * project never shows another project's data.
 */
export function useCachedState<T>(key: string, initial: T) {
  const [state, setState] = useState({
    key,
    value: queryClient.getQueryData<T>(cacheKey(key)) ?? initial,
  });

  let current = state;
  if (state.key !== key) {
    current = { key, value: queryClient.getQueryData<T>(cacheKey(key)) ?? initial };
    setState(current);
  }

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      setState((previous) => {
        const base = previous.key === key ? previous.value : initial;
        const value = typeof next === 'function' ? (next as (old: T) => T)(base) : next;
        queryClient.setQueryData(cacheKey(key), value);
        return { key, value };
      });
    },
    // `initial` is only a starting value, so a new array each render must not change the setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  return [current.value, setValue] as const;
}
