'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard] Page failed to render:', error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center" role="alert">
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This page couldn&apos;t load. Try again, and if it keeps happening, check that the API is
          running.
        </p>
        {error.digest && <p className="mt-2 text-xs text-zinc-400">Reference: {error.digest}</p>}
        <button
          onClick={reset}
          className="mt-6 bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
