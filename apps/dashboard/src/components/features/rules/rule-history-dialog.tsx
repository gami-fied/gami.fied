'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

interface Snapshot {
  name: string;
  description: string | null;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
}

interface Version {
  id: string;
  version: number;
  note: string | null;
  actor: string | null;
  createdAt: string;
  snapshot: Snapshot;
}

interface Props {
  projectId: string;
  rule: { id: string; name: string } | null;
  /** Whether the person may restore versions. */
  canRestore: boolean;
  onClose: () => void;
  onRestored: () => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed from the version before, in words. */
function changes(current: Snapshot, previous: Snapshot | undefined): string[] {
  if (!previous) return ['First version'];
  const out: string[] = [];
  if (current.name !== previous.name) out.push(`Renamed to “${current.name}”`);
  if (current.trigger !== previous.trigger) out.push(`Trigger changed to ${current.trigger}`);
  if (!same(current.conditions, previous.conditions)) out.push('Conditions changed');
  if (!same(current.actions, previous.actions)) out.push('Actions changed');
  if (current.enabled !== previous.enabled) out.push(current.enabled ? 'Turned on' : 'Turned off');
  if ((current.description ?? '') !== (previous.description ?? '')) out.push('Description changed');
  return out.length > 0 ? out : ['No change'];
}

/** Every state a rule has been live in, newest first, with a way back. */
export function RuleHistoryDialog({ projectId, rule, canRestore, onClose, onRestored }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!rule) return;
    setFailed(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/rules/${rule.id}/versions`);
      if (!res.ok) throw new Error('failed');
      setVersions((await res.json()).data);
    } catch {
      setFailed(true);
    }
  }, [projectId, rule]);

  useEffect(() => {
    setVersions(null);
    void load();
  }, [load]);

  if (!rule) return null;

  const restore = async (version: Version) => {
    const ok = await confirm({
      title: `Restore version ${version.version}?`,
      message: 'This puts that version live again straight away. The history is kept, and the restore becomes a new version.',
      confirmText: 'Restore',
    });
    if (!ok) return;
    setBusy(version.version);
    const res = await apiFetch(`/api/projects/${projectId}/rules/${rule.id}/rollback`, { method: 'POST', body: JSON.stringify({ version: version.version }) });
    setBusy(null);
    if (res.ok) {
      toast.success(`Restored version ${version.version}.`);
      onRestored();
      onClose();
    } else {
      toast.error((await res.json().catch(() => null))?.message ?? 'It could not be restored.');
    }
  };

  return (
    <Dialog isOpen onClose={onClose} title={`History of ${rule.name}`} description="Every change that went live, and who made it.">
      <div className="space-y-3">
        {failed && <p className="text-sm text-danger-300">The history couldn&apos;t load.</p>}
        {!versions && !failed && <Skeleton className="h-24 w-full" />}
        <ol className="space-y-2">
          {versions?.map((version, index) => (
            <li key={version.id} className="space-y-1 border border-zinc-800 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-100">Version {version.version}</span>
                {index === 0 && <Badge variant="emerald">Live</Badge>}
                <span className="text-zinc-400">{formatDateTime(version.createdAt)}</span>
                <span className="flex-1" />
                {canRestore && index !== 0 && (
                  <Button type="button" variant="outline" size="sm" isLoading={busy === version.version} onClick={() => void restore(version)}>
                    Restore
                  </Button>
                )}
              </div>
              {version.note && <p className="text-zinc-300">{version.note}</p>}
              <ul className="list-disc pl-4 text-zinc-400">
                {changes(version.snapshot, versions[index + 1]?.snapshot).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
