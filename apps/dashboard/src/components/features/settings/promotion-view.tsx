'use client';

import { apiFetch } from '@/lib/api-client';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ArrowRight, GitCompareArrows } from 'lucide-react';

interface Item {
  kind: string;
  identity: string;
  name: string;
  status: 'new' | 'changed' | 'same' | 'only_in_target';
  changes?: string[];
}

interface Diff {
  source: { id: string; name: string; environment: string };
  target: { id: string; name: string; environment: string };
  summary: { new: number; changed: number; same: number; onlyInTarget: number };
  data: Item[];
}

const KIND_LABEL: Record<string, string> = {
  currencies: 'Currencies',
  achievements: 'Achievements',
  levels: 'Levels',
  streaks: 'Streaks',
  segments: 'Segments',
  leagues: 'Leagues',
  rules: 'Rules',
  challenges: 'Challenges',
  boosts: 'Boosts',
  limits: 'Limits',
  rewards: 'Store rewards',
};

const idOf = (item: Pick<Item, 'kind' | 'identity'>) => `${item.kind}:${item.identity}`;

export function PromotionView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();

  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    setDiff(null);
    const res = await apiFetch(`/api/projects/${projectId}/promotion`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.message ?? 'The comparison could not load.');
      return;
    }
    setDiff(body);
    setChosen(new Set((body as Diff).data.filter((item) => item.status === 'new' || item.status === 'changed').map(idOf)));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of diff?.data ?? []) {
      if (item.status === 'same') continue;
      map.set(item.kind, [...(map.get(item.kind) ?? []), item]);
    }
    return [...map.entries()];
  }, [diff]);

  const toggle = (item: Item, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(idOf(item));
    else next.delete(idOf(item));
    setChosen(next);
  };

  const run = async () => {
    if (!projectId || !diff) return;
    const ok = await confirm({
      title: `Promote ${chosen.size} ${chosen.size === 1 ? 'change' : 'changes'} to ${diff.target.name}?`,
      message: 'They take effect for live players straight away. Rules keep their history there, so you can roll one back.',
      confirmText: 'Promote',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const items = diff.data.filter((item) => chosen.has(idOf(item))).map(({ kind, identity }) => ({ kind, identity }));
      const res = await apiFetch(`/api/projects/${projectId}/promotion`, { method: 'POST', body: JSON.stringify({ items }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'The promotion failed. Nothing was changed.');
      toast.success(`Promoted: ${body.created} added, ${body.updated} updated.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The promotion failed.');
    } finally {
      setBusy(false);
    }
  };

  const pending = diff ? diff.summary.new + diff.summary.changed : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promote changes"
        description="Copy rules, achievements, rewards and the rest of your design from this project to its target. Player data is never copied."
        actions={
          diff && pending > 0 ? (
            <Button variant="primary" size="sm" onClick={() => void run()} isLoading={busy} disabled={chosen.size === 0}>
              Promote {chosen.size}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="border border-warning-800/60 bg-warning-950/30 p-4 text-sm text-warning-200">
          {error}{' '}
          <Link href="/dashboard/settings" className="underline">
            Open settings
          </Link>
        </div>
      )}
      {!diff && !error && <CardSkeleton />}

      {diff && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <span className="font-semibold">{diff.source.name}</span>
            <Badge variant="zinc">{diff.source.environment}</Badge>
            <ArrowRight className="h-4 w-4 text-zinc-500" />
            <span className="font-semibold">{diff.target.name}</span>
            <Badge variant={diff.target.environment === 'production' ? 'orange' : 'zinc'}>{diff.target.environment}</Badge>
            <span className="text-xs text-zinc-500">
              {diff.summary.new} new · {diff.summary.changed} changed · {diff.summary.same} the same · {diff.summary.onlyInTarget} only there
            </span>
          </div>

          {pending === 0 && <EmptyState icon={GitCompareArrows} title="Nothing to promote" description={`${diff.target.name} already matches this project.`} />}

          <div className="grid gap-4 md:grid-cols-2">
            {grouped.map(([kind, items]) => (
              <Card key={kind}>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">{KIND_LABEL[kind] ?? kind}</CardTitle>
                  <CardDescription>{items.length} {items.length === 1 ? 'difference' : 'differences'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={idOf(item)} className="flex items-start justify-between gap-3">
                        {item.status === 'only_in_target' ? (
                          <span className="text-xs text-zinc-500">{item.name} <span className="text-zinc-600">(only in {diff.target.name}, left alone)</span></span>
                        ) : (
                          <Checkbox
                            checked={chosen.has(idOf(item))}
                            onChange={(e) => toggle(item, e.target.checked)}
                            label={item.name}
                            description={item.status === 'changed' ? `Changes ${item.changes?.join(', ')}` : 'New'}
                          />
                        )}
                        {item.status !== 'only_in_target' && <Badge variant={item.status === 'new' ? 'emerald' : 'orange'}>{item.status === 'new' ? 'New' : 'Changed'}</Badge>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
