'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { API_UNAVAILABLE_EVENT, queryClient } from '@/lib/api-client';

/** Stops failed loads from looking like empty data, on every screen. */
export function ApiStatusBanner() {
  const pathname = usePathname();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const show = () => setUnavailable(true);
    window.addEventListener(API_UNAVAILABLE_EVENT, show);
    return () => window.removeEventListener(API_UNAVAILABLE_EVENT, show);
  }, []);

  useEffect(() => setUnavailable(false), [pathname]);

  if (!unavailable) return null;

  return (
    <div
      role="alert"
      className="m-6 mb-0 flex items-center justify-between gap-4 border border-danger-800 bg-danger-950/40 px-4 py-3 text-sm text-danger-300"
    >
      <span>Some data couldn&apos;t load, so this page may be incomplete.</span>
      <button
        className="shrink-0 underline"
        onClick={() => {
          queryClient.clear();
          window.location.reload();
        }}
      >
        Try again
      </button>
    </div>
  );
}
