'use client';

import { apiFetch } from '@/lib/api-client';
import { formatTimeUntil } from '@/hooks/use-relative-time';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDown, ArrowUp } from 'lucide-react';

interface LeagueRow {
  league: { key: string; name: string };
  tierName: string;
  groupNo: number;
  seasonEndsAt: string;
  standings: { rank: number; userId: string; name: string | null; externalId: string; xp: number; zone: 'promotion' | 'relegation' | 'safe' }[];
}

interface Friend {
  id: string;
  externalId: string;
  name: string | null;
  totalXp: number;
}

interface FeedItem {
  type: string;
  at: string;
  name: string | null;
  title: string;
  detail: string | null;
}

/** A person's leagues, friends, invites and recent activity among friends. */
export function UserCommunity({ base }: { base: string }) {
  const [leagues, setLeagues] = useState<LeagueRow[] | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [referral, setReferral] = useState<{ code: string; invited: number; rewarded: number; pending: number } | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    const get = async <T,>(path: string, pick: (body: never) => T, set: (value: T) => void, fallback: T) => {
      try {
        const res = await apiFetch(`${base}${path}`);
        set(res.ok ? pick((await res.json()) as never) : fallback);
      } catch {
        set(fallback);
      }
    };
    void get('/leagues', (body: { data: LeagueRow[] }) => body.data, setLeagues, []);
    void get('/friends', (body: { data: Friend[] }) => body.data, setFriends, []);
    void get('/referral', (body: { code: string; invited: number; rewarded: number; pending: number }) => body, setReferral, null);
    void get('/feed?limit=15', (body: { data: FeedItem[] }) => body.data, setFeed, []);
  }, [base]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Leagues this season</CardTitle>
          <CardDescription>Their group, and who is moving up or down.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!leagues && <Skeleton className="h-24 w-full" />}
          {leagues && leagues.length === 0 && (
            <p className="text-sm text-zinc-400">
              Not in a league this season. Players join once they earn XP. <Link href="/dashboard/leagues" className="text-brand-400 hover:underline">Leagues</Link>
            </p>
          )}
          {leagues?.map((row) => {
            const me = row.standings.find((item) => base.endsWith(encodeURIComponent(item.userId)) || base.endsWith(encodeURIComponent(item.externalId)));
            return (
              <div key={row.league.key} className="border border-zinc-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{row.league.name}</span>
                  <Badge variant="orange">{row.tierName}, group {row.groupNo}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {me ? `#${me.rank} of ${row.standings.length} with ${me.xp.toLocaleString()} XP. ` : ''}Ends {formatTimeUntil(row.seasonEndsAt)}.
                  {me?.zone === 'promotion' && <span className="ml-1 inline-flex items-center gap-1 text-success-300"><ArrowUp className="h-3 w-3" /> moving up</span>}
                  {me?.zone === 'relegation' && <span className="ml-1 inline-flex items-center gap-1 text-danger-300"><ArrowDown className="h-3 w-3" /> moving down</span>}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Invites</CardTitle>
          <CardDescription>Their code, and how their invites went.</CardDescription>
        </CardHeader>
        <CardContent>
          {!referral ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <code className="border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-lg font-bold tracking-widest text-zinc-100">{referral.code}</code>
              <span className="text-xs text-zinc-400">
                {referral.invited} invited · {referral.rewarded} rewarded · {referral.pending} waiting
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Friends</CardTitle>
          <CardDescription>{friends ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}` : 'Loading'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!friends && <Skeleton className="h-16 w-full" />}
          {friends && friends.length === 0 && <p className="text-sm text-zinc-400">No friends yet.</p>}
          {friends && friends.length > 0 && (
            <ul className="divide-y divide-zinc-800">
              {friends.map((friend) => (
                <li key={friend.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/dashboard/users/${friend.id}`} className="text-zinc-200 hover:underline">{friend.name || friend.externalId}</Link>
                  <span className="text-xs text-zinc-400">{friend.totalXp.toLocaleString()} XP</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Among friends</CardTitle>
          <CardDescription>What they and their friends did lately.</CardDescription>
        </CardHeader>
        <CardContent>
          {!feed && <Skeleton className="h-16 w-full" />}
          {feed && feed.length === 0 && <p className="text-sm text-zinc-400">Nothing yet.</p>}
          {feed && feed.length > 0 && (
            <ul className="space-y-2">
              {feed.map((item, index) => (
                <li key={index} className="text-xs">
                  <span className="font-semibold text-zinc-200">{item.name ?? 'Someone'}</span> <span className="text-zinc-300">{item.title.charAt(0).toLowerCase() + item.title.slice(1)}</span>
                  {item.detail && <span className="block text-zinc-500">{item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
