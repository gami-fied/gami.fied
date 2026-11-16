import { useEffect, useRef } from 'react';

/**
 * Runs `open` once when the page is opened with `?new=1`, then removes the parameter so a refresh
 * does not open it again. Search actions such as "Create rule" use this to land on a page with its
 * dialog already open.
 */
export function useOpenOnParam(open: () => void, param = 'new') {
  const opener = useRef(open);
  opener.current = open;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState(null, '', url);
    opener.current();
  }, [param]);
}
