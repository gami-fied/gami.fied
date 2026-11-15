import type { HttpClient } from './http.js';
import type { BoxOpenResult, LeaderboardPrizeInfo, PassClaimResult, PassLane, PlayerBox, PlayerCosmetic, PlayerGoal, PlayerJourney, PlayerPass, PlayerTeam, TeamSummary, WornCosmetics } from './mechanics.js';
import { connectLive, type LiveConnection, type LiveHandlers } from './stream.js';

export interface MeResponse {
  externalId: string;
  name: string | null;
  totalXp: number;
  level: { number: number; name: string } | null;
  xpToNextLevel: number | null;
  progressPercent: number | null;
  /** The title, frame and items the player is wearing. */
  cosmetics: WornCosmetics;
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
        /** True for a step of a journey whose earlier steps are not finished. */
        locked: boolean;
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

  /** The top players for a period and the player's own place. Names and XP only, so it is safe to show. */
  /**
   * `scope: 'friends'` ranks the player among their friends, `segment` uses a segment's key, and
   * `sameAs: 'metadata.country'` ranks people who share the player's own value, such as their country.
   */
  public leaderboard(options: { period?: 'all_time' | 'daily' | 'weekly' | 'monthly'; limit?: number; scope?: 'everyone' | 'friends'; segment?: string; sameAs?: string } = {}) {
    type Entry = { rank: number; name: string | null; avatarUrl: string | null; xp: number; levelName: string | null; title: string | null; frameUrl: string | null; isMe: boolean };
    return this.http.request<{ period: string; total: number; entries: Entry[]; me: Entry | null }>({
      method: 'GET',
      path: '/v1/me/leaderboard',
      query: { period: options.period, limit: options.limit, scope: options.scope === 'friends' ? 'friends' : undefined, segment: options.segment, sameAs: options.sameAs },
    });
  }

  /**
   * Registers this phone for push notifications. Call it each time the app starts, with the token
   * the phone's push service gave you. A phone belongs to the player who registered it last.
   */
  public registerDevice(device: { token: string; platform: 'ios' | 'android' }) {
    return this.http.request<{ registered: boolean }>({ method: 'POST', path: '/v1/me/devices', body: device });
  }

  /** Stops push notifications to this phone, for example when the player signs out. */
  public unregisterDevice(token: string) {
    return this.http.request<{ removed: boolean }>({ method: 'DELETE', path: `/v1/me/devices/${encodeURIComponent(token)}` });
  }

  /** What the player can spend, one balance per currency. Expired points are not counted. */
  public wallets() {
    return this.http.request<{ data: { currency: string; name: string; symbol: string | null; balance: number }[] }>({ method: 'GET', path: '/v1/me/wallets' });
  }

  /** The store, cheapest first, with whether this player can afford each reward and whether it is in stock. */
  public store() {
    return this.http.request<{
      data: {
        key: string;
        name: string;
        description: string | null;
        imageUrl: string | null;
        currency: string;
        currencyName: string;
        currencySymbol: string | null;
        cost: number;
        inStock: boolean;
        affordable: boolean;
      }[];
    }>({ method: 'GET', path: '/v1/me/rewards' });
  }

  /**
   * Buys a reward with the player's points. Rejects with a 409 and a `code` of `INSUFFICIENT_POINTS`,
   * `OUT_OF_STOCK`, `OUT_OF_CODES` or `LIMIT_REACHED` when it cannot be bought. Pass an
   * `idempotencyKey` so that a retry after a network error does not buy twice. Needs a token
   * created with `access: 'write'`.
   */
  public redeem(rewardKey: string, options: { idempotencyKey?: string } = {}) {
    return this.http.request<{ id: string; reward: string; cost: number; status: 'pending' | 'fulfilled' | 'cancelled'; code: string | null; duplicate: boolean }>({
      method: 'POST',
      path: `/v1/me/rewards/${encodeURIComponent(rewardKey)}/redeem`,
      body: options,
    });
  }

  /** The player's 50 most recent purchases, with any code they were given. */
  public redemptions() {
    return this.http.request<{
      data: { id: string; reward: string; cost: number; status: 'pending' | 'fulfilled' | 'cancelled'; code: string | null; createdAt: string }[];
    }>({ method: 'GET', path: '/v1/me/redemptions' });
  }

  /** The player's group in each league this season, with who is moving up and down. */
  public leagues() {
    type Row = { rank: number; name: string | null; avatarUrl: string | null; xp: number; zone: 'promotion' | 'relegation' | 'safe'; isMe: boolean };
    return this.http.request<{ data: { league: { key: string; name: string }; tier: number; tierName: string; groupNo: number; seasonEndsAt: string; standings: Row[] }[] }>({ method: 'GET', path: '/v1/me/leagues' });
  }

  /** The player's invite code and how their invites went. Share the code; friends use it with `useReferral`. */
  public referral() {
    return this.http.request<{ code: string; invited: number; rewarded: number; pending: number }>({ method: 'GET', path: '/v1/me/referral' });
  }

  /** Uses a friend's invite code. Works once, in the player's first 30 days. */
  public useReferral(code: string) {
    return this.http.request<{ status: 'pending' | 'rewarded' | 'capped' }>({ method: 'POST', path: '/v1/me/referral', body: { code } });
  }

  /** Friends, found by their invite code so nobody's ID is exposed. */
  public friends() {
    return this.http.request<{ data: { name: string | null; avatarUrl: string | null; totalXp: number; code: string | null }[] }>({ method: 'GET', path: '/v1/me/friends' });
  }

  /**
   * Asks the player with this code to be friends. They become friends once the other player
   * accepts, or straight away if that player had already asked. Needs a token with `access: 'write'`.
   */
  public addFriend(code: string) {
    return this.http.request<{ friends: boolean; status: 'friends' | 'requested' }>({ method: 'POST', path: '/v1/me/friends', body: { code } });
  }

  /** Friend requests waiting for this player's answer, newest first. */
  public friendRequests() {
    return this.http.request<{ data: { name: string | null; avatarUrl: string | null; code: string; requestedAt: string }[] }>({ method: 'GET', path: '/v1/me/friends/requests' });
  }

  /** Accepts the request sent by the player with this code. */
  public acceptFriend(code: string) {
    return this.http.request<{ friends: true }>({ method: 'POST', path: `/v1/me/friends/requests/${encodeURIComponent(code)}/accept` });
  }

  /** Declines a request from the player with this code, or takes back one sent to them. */
  public declineFriend(code: string) {
    return this.http.request<void>({ method: 'DELETE', path: `/v1/me/friends/requests/${encodeURIComponent(code)}` });
  }

  public removeFriend(code: string) {
    return this.http.request<void>({ method: 'DELETE', path: `/v1/me/friends/${encodeURIComponent(code)}` });
  }

  /** What the player and their friends did lately: badges, kudos and promotions. */
  public feed() {
    return this.http.request<{ data: { type: 'achievement' | 'kudos' | 'promotion'; at: string; name: string | null; title: string; detail: string | null; isMe: boolean }[] }>({ method: 'GET', path: '/v1/me/feed' });
  }

  /** Thanks a player. One per person per day. Needs a token with `access: 'write'`. */
  public giveKudos(code: string, message?: string) {
    return this.http.request<{ id: string }>({ method: 'POST', path: '/v1/me/kudos', body: { code, message } });
  }

  public kudos() {
    return this.http.request<{ data: { from: string | null; message: string | null; createdAt: string }[] }>({ method: 'GET', path: '/v1/me/kudos' });
  }

  /** A link to an image of an achievement the player earned, to share on social media. */
  public shareAchievement(achievementKey: string) {
    return this.http.request<{ url: string }>({ method: 'GET', path: `/v1/me/achievements/${encodeURIComponent(achievementKey)}/share` });
  }

  public rank() {
    return this.http.request<{ rank: number | null; totalUsers: number }>({
      method: 'GET',
      path: '/v1/me/rank',
    });
  }

  /** The boxes and wheels the player can open, each with its drop table, cost and guarantee. */
  public boxes() {
    return this.http.request<{ data: PlayerBox[] }>({ method: 'GET', path: '/v1/me/boxes' });
  }

  /**
   * Opens a box. Rejects with a 409 and a `code` of `INSUFFICIENT_POINTS` or `LIMIT_REACHED`. Pass
   * an `idempotencyKey` so a retry does not open twice. Needs a token with `access: 'write'`.
   */
  public openBox(boxKey: string, options: { idempotencyKey?: string } = {}) {
    return this.http.request<BoxOpenResult>({ method: 'POST', path: `/v1/me/boxes/${encodeURIComponent(boxKey)}/open`, body: options });
  }

  /** The player's season passes: season XP, each tier, and what is ready to claim. */
  public passes() {
    return this.http.request<{ data: PlayerPass[] }>({ method: 'GET', path: '/v1/me/passes' });
  }

  /** Claims one reward, or everything that is ready when no tier is given. Needs a token with `access: 'write'`. */
  public claimPass(passKey: string, options: { tier?: number; lane?: PassLane } = {}) {
    return this.http.request<PassClaimResult>({ method: 'POST', path: `/v1/me/passes/${encodeURIComponent(passKey)}/claim`, body: options });
  }

  /** Buys the premium lane with the player's points. Needs a token with `access: 'write'`. */
  public buyPassPremium(passKey: string) {
    return this.http.request<{ pass: string; premium: boolean; duplicate: boolean; cost: number }>({ method: 'POST', path: `/v1/me/passes/${encodeURIComponent(passKey)}/premium` });
  }

  /** The player's team with its place and members, or null when they are in none. */
  public async team(): Promise<PlayerTeam | null> {
    return (await this.http.request<{ team: PlayerTeam | null }>({ method: 'GET', path: '/v1/me/team' })).team;
  }

  /** Every team, highest XP first: the list to join from, and the team board. */
  public teams() {
    return this.http.request<{ data: (TeamSummary & { full: boolean; isMine: boolean })[] }>({ method: 'GET', path: '/v1/me/teams' });
  }

  /** Joins a team, leaving any other. Rejects with a 409 `TEAM_FULL`. Needs a token with `access: 'write'`. */
  public joinTeam(teamKey: string) {
    return this.http.request<{ team: { key: string; name: string }; joined: boolean }>({ method: 'POST', path: '/v1/me/team', body: { team: teamKey } });
  }

  public leaveTeam() {
    return this.http.request<void>({ method: 'DELETE', path: '/v1/me/team' });
  }

  /** Shared goals, with everyone's progress or the player's team's, and what the player added. */
  public goals() {
    return this.http.request<{ data: PlayerGoal[] }>({ method: 'GET', path: '/v1/me/goals' });
  }

  /** Every cosmetic: owned, worn, and how to get the rest. */
  public cosmetics() {
    return this.http.request<{ data: PlayerCosmetic[] }>({ method: 'GET', path: '/v1/me/cosmetics' });
  }

  /** Buys a cosmetic with the player's points. Needs a token with `access: 'write'`. */
  public buyCosmetic(cosmeticKey: string) {
    return this.http.request<{ key: string; name: string; kind: string; cost: number; currency: string }>({ method: 'POST', path: `/v1/me/cosmetics/${encodeURIComponent(cosmeticKey)}/buy` });
  }

  /** Wears a cosmetic the player owns. A new title or frame replaces the one worn. Needs a token with `access: 'write'`. */
  public equipCosmetic(cosmeticKey: string) {
    return this.http.request<{ key: string; kind: string; equipped: boolean }>({ method: 'POST', path: `/v1/me/cosmetics/${encodeURIComponent(cosmeticKey)}/equip` });
  }

  public unequipCosmetic(cosmeticKey: string) {
    return this.http.request<{ key: string; kind: string; equipped: boolean }>({ method: 'DELETE', path: `/v1/me/cosmetics/${encodeURIComponent(cosmeticKey)}/equip` });
  }

  /** The prizes for places on the daily, weekly and monthly boards, and what the player has won. */
  public leaderboardPrizes() {
    return this.http.request<LeaderboardPrizeInfo>({ method: 'GET', path: '/v1/me/leaderboard/prizes' });
  }

  /** The player's journeys: each step's progress and whether it is open yet. */
  public journeys() {
    return this.http.request<{ data: PlayerJourney[] }>({ method: 'GET', path: '/v1/me/journeys' });
  }
}
