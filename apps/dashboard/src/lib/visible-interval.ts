/**
 * Repeats `callback` while the tab is visible, and catches up as soon as someone returns to it.
 * Returns a function that stops it.
 */
export function setVisibleInterval(callback: () => void, ms: number): () => void {
  const tick = () => {
    if (!document.hidden) callback();
  };
  const onVisibilityChange = () => {
    if (!document.hidden) callback();
  };

  const timer = setInterval(tick, ms);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
