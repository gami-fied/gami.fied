/** A small "Live" marker for pages that update as things happen. */
export function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold border ${
        live ? 'border-success-800/60 bg-success-950/60 text-success-300' : 'border-zinc-700 bg-zinc-800/80 text-zinc-400'
      }`}
      title={live ? 'Updates appear as they happen' : 'Reconnecting. The page still refreshes when you return to it.'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-success-400' : 'bg-zinc-500'}`} />
      {live ? 'Live' : 'Offline'}
    </span>
  );
}
