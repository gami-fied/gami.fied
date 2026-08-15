'use client';

import React, { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useLeaderboard, useUserRank } from '@/hooks/use-leaderboard';
import { LeaderboardPeriod } from '@gami/leaderboards';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TablePagination,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { Trophy, Medal, Crown, Search, UserCheck, ShieldAlert, Sparkles, User } from 'lucide-react';
import { motion } from 'motion/react';

export function LeaderboardView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id || null;

  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time');
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');

  // User Rank Lookup Modal
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  const { leaderboard, loading, error } = useLeaderboard(projectId, period, page, 20, search);
  const {
    userRank,
    loading: lookupLoading,
    error: lookupError,
  } = useUserRank(projectId, targetUserId, period);

  const handlePeriodChange = (newPeriod: LeaderboardPeriod) => {
    setPeriod(newPeriod);
    setPage(1);
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupInput.trim()) {
      setTargetUserId(lookupInput.trim());
    }
  };

  const entries = leaderboard?.entries || [];
  const top1 = entries[0];
  const top2 = entries[1];
  const top3 = entries[2];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            Leaderboards & Rankings
            <Badge variant="orange">Project Scoped</Badge>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Authoritative, project-isolated rankings derived deterministically from XP balances and
            UTC period ledgers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector Tabs */}
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
            {(['all_time', 'daily', 'weekly', 'monthly'] as LeaderboardPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-none capitalize transition ${
                  period === p
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={() => setIsLookupOpen(true)}>
            <UserCheck className="w-4 h-4 text-orange-400" />
            Lookup User Rank
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top 3 Podium Presentation */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* 2nd Place (Silver) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="md:order-1"
          >
            <Card className="bg-zinc-900/90 border-zinc-800 relative overflow-hidden text-center p-5 space-y-3">
              <div className="absolute top-3 left-3 bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-0.5 rounded-none text-[11px] font-bold flex items-center gap-1 font-mono">
                <Medal className="w-3.5 h-3.5 text-slate-300" /> #2 Silver
              </div>
              <div className="w-14 h-14 rounded-none bg-slate-800 border-2 border-slate-400/60 flex items-center justify-center mx-auto text-slate-200 font-bold text-lg shadow-lg">
                {top2 ? (top2.name ? top2.name.substring(0, 2).toUpperCase() : 'U2') : '-'}
              </div>
              <div>
                <div className="font-bold text-sm text-zinc-100 truncate">
                  {top2 ? top2.name || top2.externalId : 'No contender'}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {top2 ? top2.externalId : '-'}
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-around text-xs">
                <div>
                  <div className="text-[10px] text-zinc-500 font-medium uppercase">Period XP</div>
                  <div className="font-bold text-orange-400">
                    {top2 ? `${top2.xp.toLocaleString()} XP` : '0 XP'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 font-medium uppercase">Level</div>
                  <Badge variant="purple" className="text-[10px]">
                    {top2 ? top2.levelName || `Level ${top2.level || 1}` : 'Level 1'}
                  </Badge>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 1st Place (Gold) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.0 }}
            className="md:order-2"
          >
            <Card className="bg-gradient-to-b from-amber-950/40 via-zinc-900 to-zinc-900 border-amber-600/50 relative overflow-hidden text-center p-6 space-y-3 shadow-xl shadow-amber-950/20">
              <div className="absolute top-3 left-3 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-0.5 rounded-none text-[11px] font-bold flex items-center gap-1 font-mono">
                <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> #1 Champion
              </div>
              <div className="w-16 h-16 rounded-none bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-amber-300 font-extrabold text-xl shadow-lg shadow-amber-500/30">
                {top1 ? (top1.name ? top1.name.substring(0, 2).toUpperCase() : 'U1') : '-'}
              </div>
              <div>
                <div className="font-bold text-base text-zinc-100 truncate">
                  {top1 ? top1.name || top1.externalId : 'No contender'}
                </div>
                <div className="text-xs text-zinc-400 font-mono">
                  {top1 ? top1.externalId : '-'}
                </div>
              </div>
              <div className="pt-2 border-t border-amber-900/40 flex items-center justify-around text-xs">
                <div>
                  <div className="text-[10px] text-amber-400/80 font-semibold uppercase">
                    Period XP
                  </div>
                  <div className="font-extrabold text-amber-400 text-sm">
                    {top1 ? `${top1.xp.toLocaleString()} XP` : '0 XP'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-400/80 font-semibold uppercase">Level</div>
                  <Badge variant="amber" className="text-[10px]">
                    {top1 ? top1.levelName || `Level ${top1.level || 1}` : 'Level 1'}
                  </Badge>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 3rd Place (Bronze) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:order-3"
          >
            <Card className="bg-zinc-900/90 border-zinc-800 relative overflow-hidden text-center p-5 space-y-3">
              <div className="absolute top-3 left-3 bg-zinc-800 border border-zinc-700 text-amber-600 px-2.5 py-0.5 rounded-none text-[11px] font-bold flex items-center gap-1 font-mono">
                <Medal className="w-3.5 h-3.5 text-amber-600" /> #3 Bronze
              </div>
              <div className="w-14 h-14 rounded-none bg-amber-950/40 border-2 border-amber-700/60 flex items-center justify-center mx-auto text-amber-500 font-bold text-lg shadow-lg">
                {top3 ? (top3.name ? top3.name.substring(0, 2).toUpperCase() : 'U3') : '-'}
              </div>
              <div>
                <div className="font-bold text-sm text-zinc-100 truncate">
                  {top3 ? top3.name || top3.externalId : 'No contender'}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {top3 ? top3.externalId : '-'}
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-around text-xs">
                <div>
                  <div className="text-[10px] text-zinc-500 font-medium uppercase">Period XP</div>
                  <div className="font-bold text-orange-400">
                    {top3 ? `${top3.xp.toLocaleString()} XP` : '0 XP'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 font-medium uppercase">Level</div>
                  <Badge variant="purple" className="text-[10px]">
                    {top3 ? top3.levelName || `Level ${top3.level || 1}` : 'Level 1'}
                  </Badge>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Main Leaderboard Table Card */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Global Rankings Table ({period.replace('_', ' ')})
            </CardTitle>
            <CardDescription>
              Showing ranked project end-users with global ranks preserved during search.
            </CardDescription>
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search by name or external ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : entries.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-none bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">No Ranked Users Found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No end-users matched the specified search filter or project criteria for this
                period.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">Rank</TableHead>
                    <TableHead>User / External ID</TableHead>
                    <TableHead>XP Balance ({period})</TableHead>
                    <TableHead>Current Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const isTop1 = entry.rank === 1;
                    const isTop2 = entry.rank === 2;
                    const isTop3 = entry.rank === 3;

                    return (
                      <TableRow key={entry.userId} className={isTop1 ? 'bg-amber-950/10' : ''}>
                        <TableCell className="text-center font-bold text-xs">
                          {isTop1 && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-none bg-amber-500/20 text-amber-400 border border-amber-500/40 mx-auto font-mono">
                              1
                            </span>
                          )}
                          {isTop2 && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-none bg-slate-800 text-slate-300 border border-slate-700 mx-auto font-mono">
                              2
                            </span>
                          )}
                          {isTop3 && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-none bg-amber-950/60 text-amber-600 border border-amber-800 mx-auto font-mono">
                              3
                            </span>
                          )}
                          {!isTop1 && !isTop2 && !isTop3 && (
                            <span className="text-zinc-400 font-mono">#{entry.rank}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-none bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0 font-mono">
                              {entry.name ? (
                                entry.name.substring(0, 2).toUpperCase()
                              ) : (
                                <User className="w-4 h-4 text-zinc-500" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-xs text-zinc-200">
                                {entry.name || 'Anonymous User'}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono">
                                {entry.externalId}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-xs text-orange-400">
                          {entry.xp.toLocaleString()} XP
                        </TableCell>
                        <TableCell>
                          {entry.levelName ? (
                            <Badge variant="purple" className="text-[10px]">
                              {entry.levelName}
                            </Badge>
                          ) : (
                            <span className="text-zinc-600 font-mono text-xs">Level 1</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <TablePagination
                page={page}
                limit={20}
                hasMore={page * 20 < (leaderboard?.total || 0)}
                onPageChange={(newPage) => setPage(newPage)}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* User Rank Lookup Modal */}
      <Dialog
        isOpen={isLookupOpen}
        onClose={() => {
          setIsLookupOpen(false);
          setTargetUserId(null);
          setLookupInput('');
        }}
        title="Lookup Specific User Rank"
        description="Enter an end-user ID or external ID to lookup their exact global rank and period XP."
      >
        <form onSubmit={handleLookupSubmit} className="space-y-4">
          {lookupError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
              {lookupError}
            </div>
          )}

          <Input
            label="User ID or External ID"
            placeholder="e.g. ext_user_123"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            required
          />

          <Button type="submit" isLoading={lookupLoading} className="w-full">
            <Search className="w-4 h-4" />
            Lookup User Rank
          </Button>

          {userRank?.entry && (
            <div className="p-4 bg-zinc-950 rounded-none border border-zinc-800 space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Global Rank</span>
                <span className="text-sm font-extrabold text-amber-400">
                  #{userRank.rank} / {userRank.totalUsers}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">User Name</span>
                <span className="text-xs text-zinc-200">{userRank.entry.name || 'Anonymous'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">External ID</span>
                <span className="text-xs text-zinc-400 font-mono">{userRank.entry.externalId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  {period.replace('_', ' ')} XP
                </span>
                <span className="text-xs font-bold text-orange-400">
                  {userRank.entry.xp.toLocaleString()} XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Level</span>
                <Badge variant="purple" className="text-[10px]">
                  {userRank.entry.levelName || 'Level 1'}
                </Badge>
              </div>
            </div>
          )}
        </form>
      </Dialog>
    </div>
  );
}
