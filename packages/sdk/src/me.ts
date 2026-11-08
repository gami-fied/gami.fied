import type { HttpClient } from './http.js';
import { connectLive, type LiveConnection, type LiveHandlers } from './stream.js';

export interface MeResponse {
  externalId: string;
  name: string | null;
  totalXp: number;
  level: { number: number; name: string } | null;
  xpToNextLevel: number | null;
  progressPercent: number | null;
}

/** The signed-in end user's own data. Use with an `endUserToken`, which is safe in a browser. */
export class MeResource {
  constructor(private readonly http: HttpClient) {}

  public get(): Promise<MeResponse> {
    return this.http.request<MeResponse>({ method: 'GET', path: '/v1/me' });
  }

  /**
   * Listens for this player's notifications and XP changes as they happen, for instant toasts.
   * It reconnects on its own and resumes where it stopped. Call `close()` when the page unmounts.
   *
   * ```ts
   * const live = gami.me.subscribe({ onNotification: (n) => toast(n.title, n.message) });
   * // later
   * live.close();
   * ```
   */
  public subscribe(handlers: LiveHandlers): LiveConnection {
    return connectLive((init) => this.http.openStream('/v1/me/stream', init), handlers);
  }

  public achievements() {
    return this.http.request<{
      data: { key: string; name: string; description: string | null; awardedAt: string }[];
    }>({ method: 'GET', path: '/v1/me/achievements' });
  }

  /** How far the player is toward each achievement that measures itself. Secret ones appear once earned. */
  public achievementProgress() {
    return this.http.request<{
      data: {
        key: string;
        name: string;
        description: string | null;
        iconUrl: string | null;
        earned: boolean;
        tier: number;
        tierCount: number;
        tierName: string | null;
        value: number;
        nextTarget: number | null;
        fraction: number;
        complete: boolean;
      }[];
    }>({ method: 'GET', path: '/v1/me/achievements/progress' });
  }

  /** The player's streaks as of now. `atRisk` is true until they are active in the current period. */
  public streaks() {
    return this.http.request<{
      data: {
        key: string;
        name: string;
        cadence: 'daily' | 'weekly';
        current: number;
        longest: number;
        freezes: number;
        atRisk: boolean;
        timeZone: string;
        lastActivityAt: string | null;
      }[];
    }>({ method: 'GET', path: '/v1/me/streaks' });
  }

  public challenges() {
    return this.http.request<{
      data: {
        key: string;
        name: string;
        description: string | null;
        iconUrl: string | null;
        type: 'counter' | 'steps';
        recurrence: 'daily' | 'weekly' | null;
        target: number;
        progress: number;
        completed: boolean;
        periodEndsAt: string | null;
        steps: { name: string; done: boolean }[] | null;
      }[];
    }>({ method: 'GET', path: '/v1/me/challenges' });
  }

  public notifications() {
    return this.http.request<{
      data: { id: string; type: string; title: string; message: string; createdAt: string }[];
    }>({ method: 'GET', path: '/v1/me/notifications' });
  }

  public rank() {
    return this.http.request<{ rank: number | null; totalUsers: number }>({
      method: 'GET',
      path: '/v1/me/rank',
    });
  }
}
