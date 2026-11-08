import { projectPath, type HttpClient } from './http.js';

/** A row in a league group's table. */
export interface LeagueStandingRecord {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  avatarUrl: string | null;
  xp: number;
  zone: 'promotion' | 'relegation' | 'safe';
}

export interface UserLeagueRecord {
  league: { key: string; name: string };
  tier: number;
  tierName: string;
  groupNo: number;
  seasonEndsAt: string;
  standings: LeagueStandingRecord[];
}

export interface GroupLeaderboardRecord {
  period: string;
  groupBy: string;
  score: 'total' | 'average';
  total: number;
  entries: { rank: number; group: string; xp: number; members: number }[];
}

export interface FeedItemRecord {
  type: 'achievement' | 'kudos' | 'promotion';
  at: string;
  userId: string;
  name: string | null;
  title: string;
  detail: string | null;
}

export interface ReferralSummary {
  code: string;
  invited: number;
  rewarded: number;
  pending: number;
}

type WithProject = { projectId?: string };
const user = (params: WithProject & { userId: string }, method: string) => {
  if (!params.userId) throw new Error(`userId is required for ${method}`);
  return encodeURIComponent(params.userId);
};

/** Segments: saved groups of people, for boards and reports. */
export class SegmentsResource {
  constructor(private readonly http: HttpClient) {}

  public async list(params: WithProject = {}) {
    const res = await this.http.request<{ data: { id: string; key: string; name: string; description: string | null; filter: unknown }[] }>({ method: 'GET', path: projectPath(params.projectId, '/segments') });
    return res.data ?? [];
  }

  /** How many people are in a segment, with up to ten of them. */
  public members(params: WithProject & { segment: string }) {
    return this.http.request<{ count: number; sample: { id: string; externalId: string; name: string | null; totalXp: number }[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/segments/${encodeURIComponent(params.segment)}/members`),
    });
  }
}

/** Leagues: small groups at the same level, with promotion and relegation each season. */
export class LeaguesResource {
  constructor(private readonly http: HttpClient) {}

  public async list(params: WithProject = {}) {
    const res = await this.http.request<{ data: { id: string; key: string; name: string; tiers: string[]; cadence: 'daily' | 'weekly' }[] }>({ method: 'GET', path: projectPath(params.projectId, '/leagues') });
    return res.data ?? [];
  }

  /** Where a user stands in each league this season. Empty until they earn XP this season. */
  public async forUser(params: WithProject & { userId: string }): Promise<UserLeagueRecord[]> {
    const res = await this.http.request<{ data: UserLeagueRecord[] }>({ method: 'GET', path: projectPath(params.projectId, `/users/${user(params, 'gami.leagues.forUser()')}/leagues`) });
    return res.data ?? [];
  }
}

/** Friends, kudos and activity, from your server. Players can do the same with `gami.me`. */
export class SocialResource {
  constructor(private readonly http: HttpClient) {}

  public async friends(params: WithProject & { userId: string }) {
    const res = await this.http.request<{ data: { id: string; externalId: string; name: string | null; avatarUrl: string | null; totalXp: number }[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${user(params, 'gami.social.friends()')}/friends`),
    });
    return res.data ?? [];
  }

  /** Friendship goes both ways. Adding twice is harmless. */
  public async addFriend(params: WithProject & { userId: string; friendId: string }) {
    return this.http.request<{ friends: true }>({ method: 'POST', path: projectPath(params.projectId, `/users/${user(params, 'gami.social.addFriend()')}/friends`), body: { friendId: params.friendId } });
  }

  public async removeFriend(params: WithProject & { userId: string; friendId: string }) {
    await this.http.request<void>({ method: 'DELETE', path: projectPath(params.projectId, `/users/${user(params, 'gami.social.removeFriend()')}/friends/${encodeURIComponent(params.friendId)}`) });
  }

  /** One kudos per pair per day, and at most 30 a day from one person. */
  public async giveKudos(params: WithProject & { userId: string; to: string; message?: string }) {
    return this.http.request<{ id: string }>({ method: 'POST', path: projectPath(params.projectId, `/users/${user(params, 'gami.social.giveKudos()')}/kudos`), body: { to: params.to, message: params.message } });
  }

  /** What the user and their friends did lately. */
  public async feed(params: WithProject & { userId: string; limit?: number }): Promise<FeedItemRecord[]> {
    const res = await this.http.request<{ data: FeedItemRecord[] }>({ method: 'GET', path: projectPath(params.projectId, `/users/${user(params, 'gami.social.feed()')}/feed`), query: { limit: params.limit } });
    return res.data ?? [];
  }
}

/** Invite codes and rewards for bringing friends. */
export class ReferralsResource {
  constructor(private readonly http: HttpClient) {}

  /** A user's invite code, made the first time it is asked for, and how their invites went. */
  public get(params: WithProject & { userId: string }) {
    return this.http.request<ReferralSummary>({ method: 'GET', path: projectPath(params.projectId, `/users/${user(params, 'gami.referrals.get()')}/referral`) });
  }

  /**
   * Records that a new user joined with someone's code, for example at sign-up. Rejects with a 404
   * or 409 and a `code` such as `INVALID_CODE`, `SELF_REFERRAL`, `ALREADY_REFERRED` or `TOO_LATE`.
   */
  public claim(params: WithProject & { userId: string; code: string }) {
    return this.http.request<{ id: string; status: 'pending' | 'rewarded' | 'capped' }>({
      method: 'POST',
      path: projectPath(params.projectId, `/users/${user(params, 'gami.referrals.claim()')}/referral`),
      body: { code: params.code },
    });
  }
}
