'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { UserTimeline } from './user-timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TablePagination,
} from '@/components/ui/table';
import { ArrowLeft, Coins, Flame, Gift, Medal, Trophy } from 'lucide-react';

type Tab = 'overview' | 'ledger' | 'streaks' | 'achievements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ledger', label: 'XP ledger' },
  { id: 'streaks', label: 'Streaks' },
  { id: 'achievements', label: 'Achievements' },
];

const LEDGER_PAGE_SIZE = 25;

interface UserRecord {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  active: boolean;
  createdAt: string;
}

interface LedgerRow {
  id: string;
  amount: number;
  reason: string;
  ruleId: string | null;
  ruleExecutionId: string | null;
  eventId: string | null;
  createdAt: string;
}

interface UserStreak {
  streakId: string;
  key: string;
  name: string;
  cadence: 'daily' | 'weekly';
  current: number;
  longest: number;
  freezes: number;
  atRisk: boolean;
  timeZone: string;
  lastActivityAt: string | null;
}

interface StreakChange {
  id: string;
  streakKey: string;
  change: 'started' | 'extended' | 'frozen' | 'reset';
  current: number;
  freezesUsed: number;
  brokenStreak: number;
  createdAt: string;
}

interface AchievementProgress {
  achievementId: string;
  key: string;
  name: string;
  hidden: boolean;
  earned: boolean;
  measures: string;
  tier: number;
  tierCount: number;
  tierName: string | null;
  value: number;
  nextTarget: number | null;
  fraction: number;
  complete: boolean;
}

interface AwardedAchievement {
  id: string;
  achievementName: string;
  achievementKey: string;
  achievementDescription: string | null;
  awardedAt: string;
}

/** Loads one JSON endpoint and keeps the result, so each tab fetches only when it is opened. */
function useEndpoint<T>(path: string | null, select: (body: never) => T, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => !cancelled && setData(select(body as never)))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `select` is a stable inline mapper, and the path carries everything that changes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloads]);

  return { data, loading, failed, reload: () => setReloads((n) => n + 1) };
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="text-xl font-black text-zinc-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
    </div>
  );
}

export function UserDetailView({ userId }: { userId: string }) {
  const { selectedProject } = useDashboard();
  const { isAdminOrOwner } = usePermissions();
  const toast = useToast();
  const projectId = selectedProject?.id ?? null;
  const base = projectId ? `/api/projects/${projectId}/users/${encodeURIComponent(userId)}` : null;

  const [tab, setTab] = useState<Tab>('overview');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [grantOpen, setGrantOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [granting, setGranting] = useState(false);

  // Restore the tab from the address so a link opens the same view.
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (linked && TABS.some((item) => item.id === linked)) setTab(linked);
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };

  const user = useEndpoint<UserRecord | null>(base, (body: UserRecord) => body, null);
  const balance = useEndpoint<number>(base && `${base}/xp`, (body: { totalXp: number }) => body.totalXp, 0);
  const rank = useEndpoint<{ rank: number; totalUsers: number; levelName: string | null } | null>(
    projectId ? `/api/projects/${projectId}/leaderboard/${encodeURIComponent(userId)}?period=all_time` : null,
    (body: { rank: number; totalUsers: number; entry?: { levelName?: string | null } }) => ({
      rank: body.rank,
      totalUsers: body.totalUsers,
      levelName: body.entry?.levelName ?? null,
    }),
    null
  );
  const streaks = useEndpoint<UserStreak[]>(base && `${base}/streaks`, (body: { data: UserStreak[] }) => body.data, []);
  const best = streaks.data.reduce((max, item) => Math.max(max, item.current), 0);

  const ledger = useEndpoint<{ rows: LedgerRow[]; total: number }>(
    base && (tab === 'ledger' || tab === 'overview') ? `${base}/xp/ledger?page=${ledgerPage}&limit=${LEDGER_PAGE_SIZE}` : null,
    (body: { data: LedgerRow[]; total: number }) => ({ rows: body.data ?? [], total: body.total ?? 0 }),
    { rows: [], total: 0 }
  );
  const history = useEndpoint<StreakChange[]>(
    base && tab === 'streaks' ? `${base}/streaks/history?limit=30` : null,
    (body: { data: StreakChange[] }) => body.data,
    []
  );
  const progress = useEndpoint<AchievementProgress[]>(
    base && tab === 'achievements' ? `${base}/achievements/progress` : null,
    (body: { data: AchievementProgress[] }) => body.data,
    []
  );
  const achievements = useEndpoint<AwardedAchievement[]>(
    base && tab === 'achievements' ? `${base}/achievements` : null,
    (body: { data: AwardedAchievement[] }) => body.data,
    []
  );

  const grant = useCallback(async () => {
    if (!base) return;
    const parsed = Number.parseInt(amount, 10);
    if (!Number.isInteger(parsed) || parsed === 0) {
      toast.error('Enter a whole number other than 0. Use a negative number to remove XP.');
      return;
    }
    setGranting(true);
    try {
      const res = await apiFetch(`${base}/xp/adjust`, {
        method: 'POST',
        body: JSON.stringify({ amount: parsed, reason: reason.trim() || 'Manual adjustment', idempotencyKey: `adj_${crypto.randomUUID()}` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The adjustment failed.');
      toast.success(parsed > 0 ? `Gave ${parsed} XP.` : `Removed ${Math.abs(parsed)} XP.`);
      setGrantOpen(false);
      setAmount('');
      setReason('');
      balance.reload();
      ledger.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The adjustment failed.');
    } finally {
      setGranting(false);
    }
  }, [amount, base, balance, ledger, reason, toast]);

  const person = user.data;
  const title = person?.name || person?.externalId || 'User';

  if (!projectId) {
    return <p className="text-sm text-zinc-400">Choose a project to see its users.</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/users" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-3.5 w-3.5" />
        All users
      </Link>

      <PageHeader
        title={user.loading && !person ? 'Loading user' : title}
        description={
          person ? (
            <>
              <span className="font-mono">{person.externalId}</span>
              {person.email && <> · {person.email}</>} · Joined {formatDateTime(person.createdAt)}
              {!person.active && <Badge variant="rose" className="ml-2">Deactivated</Badge>}
            </>
          ) : undefined
        }
        actions={
          isAdminOrOwner && person ? (
            <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
              <Gift className="h-3.5 w-3.5" />
              Give or remove XP
            </Button>
          ) : undefined
        }
        toolbar={
          <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => selectTab(item.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm transition-colors ${
                  tab === item.id ? 'border-brand-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      {user.failed && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This user couldn&apos;t be found in this project.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Coins className="h-3.5 w-3.5 text-brand-400" />} label="XP" value={balance.loading ? '…' : balance.data.toLocaleString()} />
        <Stat
          icon={<Medal className="h-3.5 w-3.5 text-warning-400" />}
          label="Rank"
          value={rank.data ? `#${rank.data.rank}` : '–'}
          hint={rank.data ? `of ${rank.data.totalUsers.toLocaleString()} ranked` : 'Not ranked yet'}
        />
        <Stat icon={<Trophy className="h-3.5 w-3.5 text-info-400" />} label="Level" value={rank.data?.levelName ?? '–'} />
        <Stat
          icon={<Flame className="h-3.5 w-3.5 text-danger-400" />}
          label="Best streak"
          value={best}
          hint={streaks.data.some((s) => s.atRisk && s.current > 0) ? 'One is at risk today' : undefined}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Recent XP</CardTitle>
              <CardDescription>The latest entries.</CardDescription>
            </CardHeader>
            <CardContent>
              <LedgerTable rows={ledger.data.rows.slice(0, 6)} loading={ledger.loading} />
              <button className="mt-3 text-xs text-brand-400 hover:underline" onClick={() => selectTab('ledger')}>
                See the full ledger
              </button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <UserTimeline projectId={projectId} userId={userId} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'ledger' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">XP ledger</CardTitle>
            <CardDescription>
              Every change to this user&apos;s XP, newest first. {ledger.data.total.toLocaleString()} entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ledger.failed && <p className="text-sm text-danger-300">The ledger couldn&apos;t load.</p>}
            <LedgerTable rows={ledger.data.rows} loading={ledger.loading} showSource />
            <TablePagination
              page={ledgerPage}
              limit={LEDGER_PAGE_SIZE}
              onPageChange={setLedgerPage}
              hasMore={ledgerPage * LEDGER_PAGE_SIZE < ledger.data.total}
            />
          </CardContent>
        </Card>
      )}

      {tab === 'streaks' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {streaks.loading && <Skeleton className="h-28 w-full" />}
            {!streaks.loading && streaks.data.length === 0 && (
              <p className="text-sm text-zinc-400">
                No streaks are set up in this project.{' '}
                <Link href="/dashboard/streaks" className="text-brand-400 hover:underline">
                  Create one
                </Link>
                .
              </p>
            )}
            {streaks.data.map((item) => (
              <Card key={item.streakId}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-100">{item.name}</span>
                    {item.atRisk && item.current > 0 ? <Badge variant="amber">At risk</Badge> : null}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-brand-400">{item.current}</span>
                    <span className="text-sm text-zinc-400">{item.cadence === 'weekly' ? 'weeks' : 'days'} in a row</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Best {item.longest} · {item.freezes} freeze{item.freezes === 1 ? '' : 's'} · {item.timeZone}
                    {item.lastActivityAt && <> · Last active {formatRelativeTime(item.lastActivityAt)}</>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Streak history</CardTitle>
            </CardHeader>
            <CardContent>
              {history.data.length === 0 && !history.loading && <p className="text-sm text-zinc-400">Nothing yet.</p>}
              <ol className="space-y-1.5 text-sm">
                {history.data.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="w-20 shrink-0 text-xs capitalize text-zinc-400">{entry.change}</span>
                    <span className="min-w-0 flex-1 text-zinc-200">
                      {entry.streakKey}: {entry.change === 'reset' ? `ended at ${entry.brokenStreak}, now ${entry.current}` : entry.current}
                      {entry.freezesUsed > 0 && ` (${entry.freezesUsed} freeze${entry.freezesUsed === 1 ? '' : 's'} used)`}
                    </span>
                    <time className="shrink-0 text-xs text-zinc-400" dateTime={entry.createdAt}>
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'achievements' && progress.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Progress</CardTitle>
            <CardDescription>Achievements that measure themselves, including secret ones.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {progress.data.map((item) => (
                <li key={item.achievementId} className="space-y-2 border border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-zinc-100">{item.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {item.hidden && <Badge variant="zinc">Secret</Badge>}
                      {item.complete ? (
                        <Badge variant="emerald">Done</Badge>
                      ) : item.earned ? (
                        <Badge variant="amber">{item.tierName ?? 'Earned'}</Badge>
                      ) : null}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full bg-zinc-800"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.fraction * 100)}
                    aria-label={`${item.name} progress`}
                  >
                    <div className="h-full bg-brand-500" style={{ width: `${Math.round(item.fraction * 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>{item.measures}</span>
                    <span>
                      {item.value.toLocaleString()}
                      {item.nextTarget !== null && ` / ${item.nextTarget.toLocaleString()}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {tab === 'achievements' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Achievements</CardTitle>
            <CardDescription>Badges this user has earned.</CardDescription>
          </CardHeader>
          <CardContent>
            {achievements.loading && <Skeleton className="h-20 w-full" />}
            {!achievements.loading && achievements.data.length === 0 && (
              <p className="text-sm text-zinc-400">No achievements earned yet.</p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {achievements.data.map((award) => (
                <li key={award.id} className="border border-zinc-800 p-3">
                  <div className="flex items-center gap-2 font-semibold text-zinc-100">
                    <Trophy className="h-4 w-4 text-warning-400" />
                    {award.achievementName}
                  </div>
                  {award.achievementDescription && <p className="mt-1 text-xs text-zinc-400">{award.achievementDescription}</p>}
                  <p className="mt-1 text-xs text-zinc-500">Earned {formatDateTime(award.awardedAt)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog
        isOpen={grantOpen}
        onClose={() => setGrantOpen(false)}
        title="Give or remove XP"
        description="Recorded in the ledger with your reason. Use a negative number to remove XP."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void grant();
          }}
        >
          <Input label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" required />
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Support credit" maxLength={256} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={granting}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function LedgerTable({ rows, loading, showSource = false }: { rows: LedgerRow[]; loading: boolean; showSource?: boolean }) {
  if (loading && rows.length === 0) return <Skeleton className="h-24 w-full" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Amount</TableHead>
          <TableHead>Reason</TableHead>
          {showSource && <TableHead>Source</TableHead>}
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <span className={`font-bold ${entry.amount > 0 ? 'text-success-400' : 'text-danger-400'}`}>
                {entry.amount > 0 ? `+${entry.amount}` : entry.amount} XP
              </span>
            </TableCell>
            <TableCell className="text-xs text-zinc-300">{entry.reason}</TableCell>
            {showSource && (
              <TableCell className="text-[11px] text-zinc-400">
                {entry.ruleId ? (
                  <Link href="/dashboard/rules" className="hover:underline" title={entry.ruleId}>
                    Rule
                  </Link>
                ) : (
                  'Manual'
                )}
                {entry.eventId && <span className="ml-1 font-mono" title={entry.eventId}>· event</span>}
              </TableCell>
            )}
            <TableCell className="text-xs text-zinc-400" title={formatDateTime(entry.createdAt)}>
              {formatRelativeTime(entry.createdAt)}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={showSource ? 4 : 3} className="py-6 text-center text-xs text-zinc-400">
              No XP history yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
