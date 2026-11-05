'use client';

import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';

interface TraceEntry {
  eventId: string;
  occurredAt: string;
  matched: boolean;
  reason: string | null;
  execution: { status: string; error: string | null } | null;
}

export function RuleTraceDialog({
  projectId,
  rule,
  onClose,
}: {
  projectId: string;
  rule: { id: string; name: string; trigger: string };
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TraceEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}/rules/${rule.id}/trace`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => setEntries(body.data))
      .catch(() => setFailed(true));
  }, [projectId, rule.id]);

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={`Why did "${rule.name}" fire?`}
      description={`The last 20 "${rule.trigger}" events, checked against the rule as it is now.`}
      maxWidth="2xl"
    >
      {failed && (
        <p role="alert" className="text-sm text-danger-300">
          The trace couldn&apos;t load. Close this and try again.
        </p>
      )}
      {!failed && !entries && <TableSkeleton rows={4} />}
      {entries?.length === 0 && (
        <p className="text-sm text-zinc-300">
          No &quot;{rule.trigger}&quot; events yet, so this rule hasn&apos;t had anything to match.
          Check that your app sends this exact event name.
        </p>
      )}
      <ul className="space-y-2">
        {entries?.map((entry) => (
          <li key={entry.eventId} className="border border-zinc-800 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className={entry.matched ? 'text-success-300' : 'text-warning-300'}>
                {entry.matched ? 'Matches' : 'Does not match'}
              </span>
              <time className="text-xs text-zinc-400" dateTime={entry.occurredAt}>
                {formatDateTime(entry.occurredAt)}
              </time>
            </div>
            {entry.reason && <p className="text-xs text-zinc-400 mt-1">{entry.reason}</p>}
            <p className="text-xs text-zinc-400 mt-1">
              {entry.execution
                ? `Last run: ${entry.execution.status}${entry.execution.error ? ` (${entry.execution.error})` : ''}`
                : 'Not run yet'}
            </p>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
