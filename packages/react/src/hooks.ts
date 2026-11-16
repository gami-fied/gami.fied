import { useEffect, useState } from 'react';
import { useGami } from './provider.js';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/** Fetches once, then again whenever live updates say the player's data changed. */
function useResource<T>(load: (client: ReturnType<typeof useGami>['client']) => Promise<T>, deps: unknown[]): Resource<T> {
  const { client, version, refresh } = useGami();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Keep what is showing while it refreshes, so numbers do not flicker away.
    setState((current) => ({ ...current, loading: current.data === null, error: null }));
    load(client)
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error: unknown) =>
        !cancelled && setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error : new Error(String(error)) }))
      );
    return () => {
      cancelled = true;
    };
    // `load` is an inline function, so the values that shape the request are passed in `deps`.
  }, [client, version, ...deps]);

  return { ...state, refresh };
}

type Me = Awaited<ReturnType<ReturnType<typeof useGami>['client']['me']['get']>>;

/** The player's name, XP and level. */
export const useMe = (): Resource<Me> => useResource((client) => client.me.get(), []);

/** The player's streaks as of now. */
export const useStreaks = () => useResource(async (client) => (await client.me.streaks()).data, []);

/** The player's progress toward achievements that measure themselves. Secret ones appear once earned. */
export const useAchievementProgress = () => useResource(async (client) => (await client.me.achievementProgress()).data, []);

/** Challenges open right now, with the player's progress. */
export const useChallenges = () => useResource(async (client) => (await client.me.challenges()).data, []);

export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';

/** The top players and the player's own place. */
export const useLeaderboard = (period: LeaderboardPeriod = 'all_time', limit = 10) =>
  useResource((client) => client.me.leaderboard({ period, limit }), [period, limit]);

export interface InboxNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResource extends Resource<InboxNotification[]> {
  /** How many of the player's notifications are unread, in all. */
  unreadCount: number;
  /** Marks one notification read. A read-only token is enough. */
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * The player's inbox, newest first, with live ones added as they arrive, the unread count, and
 * ways to mark them read.
 */
export function useNotifications(limit = 20): NotificationsResource {
  const base = useResource((client) => client.me.notifications({ limit: Math.min(100, limit) }), [limit]);
  const { client, notifications, refresh } = useGami();
  const fetched = base.data?.data ?? [];
  const known = new Set(fetched.map((item) => item.id));
  // One that arrived live and is not in the fetched list yet is unread by definition.
  const live = notifications
    .filter((item) => !known.has(item.id))
    .map((item) => ({ id: item.id, type: item.type, title: item.title, message: item.message, createdAt: item.createdAt, readAt: null, read: false }));
  return {
    ...base,
    data: [...live, ...fetched].slice(0, limit),
    unreadCount: (base.data?.unreadCount ?? 0) + live.length,
    markRead: async (id) => {
      await client.me.markNotificationRead(id);
      refresh();
    },
    markAllRead: async () => {
      await client.me.markAllNotificationsRead();
      refresh();
    },
  };
}

/** Boxes and wheels the player can open, with their odds. */
export const useBoxes = () => useResource(async (client) => (await client.me.boxes()).data, []);

/** The player's season passes. */
export const usePasses = () => useResource(async (client) => (await client.me.passes()).data, []);

/** The player's team, or null when they are in none. */
export const useTeam = () => useResource((client) => client.me.team(), []);

/** Shared goals, with the player's own contribution. */
export const useGoals = () => useResource(async (client) => (await client.me.goals()).data, []);

/** Every cosmetic: owned, worn, and how to get the rest. */
export const useCosmetics = () => useResource(async (client) => (await client.me.cosmetics()).data, []);

/** The player's journeys, with each step's progress. */
export const useJourneys = () => useResource(async (client) => (await client.me.journeys()).data, []);
