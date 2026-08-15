'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useXp } from '@/hooks/use-xp';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Coins, Search, PlusCircle, MinusCircle, Users, History, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '@/hooks/use-relative-time';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `adj_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  }
  return `adj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export function XpView() {
  const { selectedProject } = useDashboard();
  const { summary, ledger, userBalance, loadingLedger, fetchXpSummary, fetchUserLedger, adjustXp } =
    useXp(selectedProject?.id || null);

  const [lookupUserId, setLookupUserId] = useState('');
  const [activeSearchedUser, setActiveSearchedUser] = useState('');

  // Adjustment Form State
  const [adjUserId, setAdjUserId] = useState('');
  const [adjAmount, setAdjAmount] = useState<number>(100);
  const [adjReason, setAdjReason] = useState('');
  const [adjIdempotencyKey, setAdjIdempotencyKey] = useState(() => generateIdempotencyKey());
  const refreshIdempotencyKey = useCallback(
    () => setAdjIdempotencyKey(generateIdempotencyKey()),
    []
  );
  const [submittingAdj, setSubmittingAdj] = useState(false);
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null);
  const [adjError, setAdjError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProject) {
      fetchXpSummary();
    }
  }, [selectedProject, fetchXpSummary]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupUserId.trim()) return;
    setActiveSearchedUser(lookupUserId.trim());
    fetchUserLedger(lookupUserId.trim());
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjUserId.trim() || adjAmount === 0 || !adjReason.trim()) return;
    setSubmittingAdj(true);
    setAdjSuccess(null);
    setAdjError(null);

    try {
      await adjustXp(
        adjUserId.trim(),
        adjAmount,
        adjReason.trim(),
        adjIdempotencyKey.trim() || undefined
      );

      setAdjSuccess(
        `Successfully adjusted ${adjAmount > 0 ? '+' : ''}${adjAmount} XP for user ${adjUserId.trim()}`
      );
      if (activeSearchedUser === adjUserId.trim()) {
        fetchUserLedger(adjUserId.trim());
      }
      setAdjReason('');
      setAdjIdempotencyKey(generateIdempotencyKey());
    } catch (err: unknown) {
      setAdjError((err as Error).message);
    } finally {
      setSubmittingAdj(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to view XP metrics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight">XP & Ledger System</h1>
        <p className="text-xs text-zinc-400 mt-1">
          XP balance tracking, transaction ledger history, and manual adjustments for{' '}
          <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total XP Awarded
            </CardTitle>
            <Coins className="w-4 h-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-orange-400">
              {summary?.totalXpAwarded?.toLocaleString() || 0} XP
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Project aggregate total</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Ledger Entries
            </CardTitle>
            <History className="w-4 h-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-400">
              {summary?.totalTransactions?.toLocaleString() || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Atomic ledger records</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Active End-Users
            </CardTitle>
            <Users className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">
              {summary?.totalUsersWithXp?.toLocaleString() || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Users with XP balance {'>'} 0</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: User Lookup & Ledger History */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">End-User XP Ledger Inspection</CardTitle>
              <CardDescription>
                Search end-user ID to inspect total XP balance and full ledger history
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleLookup} className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Enter End-User ID (e.g. usr_123)"
                    value={lookupUserId}
                    onChange={(e) => setLookupUserId(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="primary" isLoading={loadingLedger}>
                  <Search className="w-4 h-4" />
                  Lookup Ledger
                </Button>
              </form>

              {activeSearchedUser && (
                <div className="p-4 bg-zinc-950 rounded-none border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-500 block">End-User ID</span>
                    <span className="font-mono text-sm font-bold text-zinc-100">
                      {activeSearchedUser}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-zinc-500 block">Current XP Balance</span>
                    <span className="text-lg font-black text-orange-400">
                      {userBalance !== null ? userBalance.toLocaleString() : 0} XP
                    </span>
                  </div>
                </div>
              )}

              {activeSearchedUser && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Execution Context</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span
                            className={`font-mono font-bold ${
                              entry.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {entry.amount > 0 ? `+${entry.amount}` : entry.amount} XP
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-300">{entry.reason}</TableCell>
                        <TableCell className="font-mono text-[11px] text-zinc-500">
                          {entry.ruleExecutionId || entry.ruleId || 'manual'}
                        </TableCell>
                        <TableCell
                          className="text-xs text-zinc-400 cursor-default"
                          title={new Date(entry.createdAt).toLocaleString()}
                        >
                          {formatRelativeTime(entry.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}

                    {ledger.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-zinc-500 text-xs">
                          No ledger history records found for this user.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Top XP Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Top Users Leaderboard</CardTitle>
              <CardDescription>Highest XP holders in this project</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead className="text-right">Total XP Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary?.topUsers?.map((u, i) => (
                    <TableRow key={u.userId}>
                      <TableCell className="font-bold text-amber-400 text-xs">#{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-300">{u.userId}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{u.externalId}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-orange-400">
                        {u.totalXp.toLocaleString()} XP
                      </TableCell>
                    </TableRow>
                  ))}

                  {(!summary?.topUsers || summary.topUsers.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-zinc-500 text-xs">
                        No active users with XP balance yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Manual XP Adjustment Form */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Issue Manual XP Adjustment</CardTitle>
              <CardDescription>
                Directly adjust an end-user&apos;s XP balance with atomic ledger auditing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdjustSubmit} className="space-y-4">
                {adjSuccess && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs rounded-none">
                    {adjSuccess}
                  </div>
                )}
                {adjError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
                    {adjError}
                  </div>
                )}

                <Input
                  label="End-User ID"
                  placeholder="e.g. usr_123"
                  value={adjUserId}
                  onChange={(e) => setAdjUserId(e.target.value)}
                  required
                />

                <Input
                  label="XP Amount (+ for award, - for penalty)"
                  type="number"
                  placeholder="e.g. 100 or -50"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(parseInt(e.target.value) || 0)}
                  required
                />

                <Input
                  label="Reason"
                  placeholder="e.g. Customer support bonus"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300">Idempotency Key</label>
                    <button
                      type="button"
                      onClick={refreshIdempotencyKey}
                      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-orange-400 transition"
                      title="Generate a new key"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                  <Input
                    placeholder="Auto-generated idempotency key"
                    value={adjIdempotencyKey}
                    onChange={(e) => setAdjIdempotencyKey(e.target.value)}
                    helperText="Auto-generated. Prevents duplicate submissions on retry."
                  />
                </div>

                <Button
                  type="submit"
                  variant={adjAmount >= 0 ? 'primary' : 'danger'}
                  isLoading={submittingAdj}
                  className="w-full"
                >
                  {adjAmount >= 0 ? (
                    <PlusCircle className="w-4 h-4" />
                  ) : (
                    <MinusCircle className="w-4 h-4" />
                  )}
                  {adjAmount >= 0 ? `Award +${adjAmount} XP` : `Deduct ${adjAmount} XP`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
