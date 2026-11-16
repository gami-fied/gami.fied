'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Says so when the server cannot be reached, on the pages people see before they sign in. Without
 * it a stopped server shows a normal-looking form that only fails once it is sent.
 */
export function ServerUnreachableNotice() {
  const [unreachable, setUnreachable] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/ok', { cache: 'no-store' });
      setUnreachable(res.status >= 500);
    } catch {
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (!unreachable) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 border border-danger-800 bg-danger-950/40 px-4 py-3 text-sm text-danger-300"
    >
      <span>The server can&apos;t be reached right now, so signing in won&apos;t work yet.</span>
      <button type="button" className="shrink-0 underline" onClick={() => void check()}>
        Try again
      </button>
    </div>
  );
}
