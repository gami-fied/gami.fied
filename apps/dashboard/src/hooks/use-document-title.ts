import { useEffect } from 'react';

/**
 * Sets the browser tab's title and keeps it. The framework writes its own default title back on
 * every in-app navigation, after page effects have run, so setting it once is not enough.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
