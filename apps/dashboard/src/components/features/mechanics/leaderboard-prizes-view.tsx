'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Award } from 'lucide-react';
import { FieldLabel, MechanicList, numberOrNull, type MechanicConfig } from './mechanic-list';
import { describePrizes, PrizeEditor, type Prize } from './prize-editor';

type Period = 'daily' | 'weekly' | 'monthly';

interface PrizeRule {
  id: string;
  name: string;
  period: Period;
  fromRank: number;
  toRank: number;
  rewards: Prize[];
  lastPaidPeriod: string | null;
  enabled: boolean;
}

interface Draft {
  name: string;
  period: Period;
  fromRank: string;
  toRank: string;
  rewards: Prize[];
}

interface Payout {
  id: string;
  prizeName: string;
  period: Period;
  periodStart: string;
  rank: number;
  xp: number;
  rewards: Prize[];
  userId: string;
  externalId: string;
  name: string | null;
  createdAt: string;
}

const PERIOD = { daily: 'Daily board', weekly: 'Weekly board', monthly: 'Monthly board' } as const;
const places = (from: number, to: number) => (from === to ? `Place ${from}` : `Places ${from} to ${to}`);

const config: MechanicConfig<PrizeRule, Draft> = {
  endpoint: '/leaderboard-prizes',
  noun: 'prize',
  icon: Award,
  emptyTitle: 'No leaderboard prizes yet',
  emptyDescription: 'Without a prize, a board that closes pays nothing. Add one to pay the top places of the daily, weekly or monthly board when the period ends.',
  dialogDescription: 'Periods are in UTC, like the boards. A prize covers periods that end after it was made, and is paid within about ten minutes of the period ending.',
  toggles: true,
  deleteMessage: 'No more periods are paid. Prizes already paid stay with the players.',
  blank: () => ({ name: '', period: 'weekly', fromRank: '1', toRank: '3', rewards: [{ type: 'xp', amount: 100 }] }),
  toDraft: (rule) => ({ name: rule.name, period: rule.period, fromRank: String(rule.fromRank), toRank: String(rule.toRank), rewards: rule.rewards }),
  toBody: (draft) => ({ name: draft.name.trim(), period: draft.period, fromRank: numberOrNull(draft.fromRank) ?? 1, toRank: numberOrNull(draft.toRank) ?? 1, rewards: draft.rewards }),
  title: (rule) => rule.name,
  badges: (rule) => [{ label: PERIOD[rule.period], variant: 'blue' }],
  lines: (rule) => [
    `${places(rule.fromRank, rule.toRank)}: ${describePrizes(rule.rewards)} each`,
    rule.lastPaidPeriod ? `Last paid for the period starting ${rule.lastPaidPeriod}.` : 'Not paid yet.',
  ],
  form: (draft, set, options) => (
    <>
      <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Weekly top 3" helperText="Players see this when they win." required />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel>Board</FieldLabel>
          <Dropdown options={(Object.keys(PERIOD) as Period[]).map((period) => ({ value: period, label: PERIOD[period] }))} value={draft.period} onChange={(period) => set({ period: period as Period })} />
        </div>
        <Input label="From place *" type="number" min={1} max={100} value={draft.fromRank} onChange={(e) => set({ fromRank: e.target.value })} required />
        <Input label="To place *" type="number" min={1} max={100} value={draft.toRank} onChange={(e) => set({ toRank: e.target.value })} helperText="Up to 100" required />
      </div>
      <PrizeEditor label="Prize for each of those places" value={draft.rewards} onChange={(rewards) => set({ rewards })} options={options} />
    </>
  ),
};

export function LeaderboardPrizesView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const [payouts, setPayouts] = useState<Payout[] | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setPayouts(null);
    apiFetch(`/api/projects/${projectId}/leaderboard-prizes/payouts`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data: Payout[] }) => setPayouts(body.data))
      .catch(() => setPayouts([]));
  }, [projectId]);

  return (
    <div className="space-y-6">
      <PageHeader title="Leaderboard prizes" description="Pay the top places of the daily, weekly or monthly board in XP, a currency, a badge or a cosmetic when the period ends." />
      <MechanicList config={config} />
      {payouts && payouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Paid lately</CardTitle>
            <CardDescription>The 100 most recent, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Prize</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="w-16">Place</TableHead>
                  <TableHead>Got</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      <Link href={`/dashboard/users/${row.userId}`} className="hover:underline">
                        {row.name || row.externalId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{row.prizeName}</TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {PERIOD[row.period]?.replace(' board', '') ?? row.period}, from {row.periodStart}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-zinc-300">#{row.rank}</TableCell>
                    <TableCell className="text-xs">{describePrizes(row.rewards)}</TableCell>
                    <TableCell className="text-xs text-zinc-400">{formatDateTime(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
