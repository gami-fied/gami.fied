import { projectPath, type HttpClient } from './http.js';

/** Something a player can be given. Everything is named by its key. */
export type Prize =
  | { type: 'xp'; amount: number }
  | { type: 'currency'; currency: string; amount: number }
  | { type: 'achievement'; achievement: string }
  | { type: 'cosmetic'; cosmetic: string };

/** One item in a box, with its published chance as a percentage. */
export interface BoxDrop {
  id: string;
  name: string;
  rare: boolean;
  chance: number;
  prizes: Prize[];
}

/** A mystery box or wheel as one player sees it. */
export interface PlayerBox {
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  kind: 'box' | 'wheel';
  cost: number;
  currency: string | null;
  currencyName: string | null;
  currencySymbol: string | null;
  affordable: boolean;
  /** The drop table: every item and its chance. */
  items: BoxDrop[];
  guaranteeAfter: number | null;
  /** Tries left before one is sure to give a rare item. 0 means the next one will. */
  triesUntilGuarantee: number | null;
  dailyLimit: number | null;
  triesLeftToday: number | null;
}

export interface BoxOpenResult {
  id: string;
  item: { id: string; name: string; rare: boolean };
  prizes: Prize[];
  /** True when the guarantee chose the item, not chance. */
  guaranteed: boolean;
  cost: number;
  createdAt: string;
  /** True when this idempotency key was used before, so nothing was opened again. */
  duplicate: boolean;
}

export type PassLane = 'free' | 'premium';

export interface PassLaneState {
  prizes: Prize[];
  claimed: boolean;
  claimable: boolean;
}

export interface PlayerPass {
  key: string;
  name: string;
  description: string | null;
  status: 'upcoming' | 'active' | 'ended';
  startAt: string;
  endAt: string;
  claimUntil: string;
  /** XP earned while the season has been running. */
  xp: number;
  /** How many tiers are unlocked. */
  tier: number;
  xpToNextTier: number | null;
  premium: { available: boolean; owned: boolean; cost: number | null; currency: string | null; currencyName: string | null; currencySymbol: string | null; affordable: boolean };
  tiers: { tier: number; xp: number; unlocked: boolean; free: PassLaneState; premium: PassLaneState }[];
}

export interface PassClaimResult {
  pass: string;
  claimed: { tier: number; lane: PassLane; prizes: Prize[] }[];
}

export interface TeamSummary {
  key: string;
  name: string;
  imageUrl: string | null;
  members: number;
  maxMembers: number | null;
  xp: number;
  rank: number;
}

export interface PlayerTeam extends Omit<TeamSummary, 'rank'> {
  rank: number | null;
  /** How many teams there are. */
  teams: number;
  roster: { name: string | null; avatarUrl: string | null; xp: number; isMe: boolean }[];
}

export interface PlayerGoal {
  key: string;
  name: string;
  description: string | null;
  scope: 'community' | 'team';
  /** For a team goal, the player's team, or null when they are in none. */
  team?: { key: string; name: string } | null;
  target: number;
  progress: number;
  percent: number;
  completed: boolean;
  completedAt: string | null;
  myContribution: number;
  endsAt: string | null;
  open: boolean;
  rewards: Prize[];
}

export interface PlayerCosmetic {
  key: string;
  name: string;
  description: string | null;
  kind: 'title' | 'frame' | 'item';
  imageUrl: string | null;
  owned: boolean;
  equipped: boolean;
  achievement: { key: string; name: string } | null;
  cost: number | null;
  currency: string | null;
  currencySymbol: string | null;
  affordable: boolean;
}

/** What a player is wearing. */
export interface WornCosmetics {
  title: { key: string; name: string } | null;
  frame: { key: string; name: string; imageUrl: string | null } | null;
  items: { key: string; name: string; imageUrl: string | null }[];
}

export interface PlayerJourney {
  key: string;
  name: string;
  description: string | null;
  completed: boolean;
  stepsDone: number;
  rewards: Prize[];
  steps: { challenge: string; name: string; description: string | null; target: number; progress: number; completed: boolean; locked: boolean }[];
}

export interface LeaderboardPrizeInfo {
  prizes: { name: string; period: 'daily' | 'weekly' | 'monthly'; fromRank: number; toRank: number; rewards: Prize[] }[];
  won: { period: string; periodStart: string; rank: number; xp: number; rewards: Prize[]; paidAt: string }[];
}

interface ForUser {
  userId: string;
  projectId?: string;
}

const userPath = (params: ForUser, rest: string) => projectPath(params.projectId, `/users/${encodeURIComponent(params.userId)}${rest}`);

/**
 * Boxes, season passes, teams, shared goals, cosmetics, journeys and leaderboard prizes, from your
 * server. Reads need `rewards:read`, `social:read`, `challenges:read` or `leaderboard:read`; the
 * calls that change something need the matching `write` scope.
 */
export class MechanicsResource {
  constructor(private readonly http: HttpClient) {}

  private async list<T>(path: string): Promise<T[]> {
    const res = await this.http.request<{ data: T[] }>({ method: 'GET', path });
    return res.data ?? [];
  }

  /** Calls GET /v1/boxes */
  public boxes(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/boxes'));
  }

  /** The boxes a user can open, with the odds. Calls GET /v1/users/:userId/boxes */
  public userBoxes(params: ForUser) {
    return this.list<PlayerBox>(userPath(params, '/boxes'));
  }

  /**
   * Opens a box for a user. The cost, the draw and the prizes happen together. Rejects with a 409
   * and a `code` of `INSUFFICIENT_POINTS` or `LIMIT_REACHED`.
   * Calls POST /v1/users/:userId/boxes/:boxKey/open
   */
  public openBox(params: ForUser & { boxKey: string; idempotencyKey?: string }) {
    return this.http.request<BoxOpenResult>({ method: 'POST', path: userPath(params, `/boxes/${encodeURIComponent(params.boxKey)}/open`), body: { idempotencyKey: params.idempotencyKey } });
  }

  /** Calls GET /v1/passes */
  public passes(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/passes'));
  }

  /** Calls GET /v1/users/:userId/passes */
  public userPasses(params: ForUser) {
    return this.list<PlayerPass>(userPath(params, '/passes'));
  }

  /** Claims one reward, or everything that is ready when `tier` and `lane` are left out. Calls POST /v1/users/:userId/passes/:passKey/claim */
  public claimPass(params: ForUser & { passKey: string; tier?: number; lane?: PassLane }) {
    return this.http.request<PassClaimResult>({ method: 'POST', path: userPath(params, `/passes/${encodeURIComponent(params.passKey)}/claim`), body: { tier: params.tier, lane: params.lane } });
  }

  /** Gives a user the premium lane, for example after they paid you. Calls POST /v1/users/:userId/passes/:passKey/premium */
  public grantPremium(params: ForUser & { passKey: string }) {
    return this.http.request<{ pass: string; premium: boolean }>({ method: 'POST', path: userPath(params, `/passes/${encodeURIComponent(params.passKey)}/premium`) });
  }

  /** Calls GET /v1/cosmetics */
  public cosmetics(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/cosmetics'));
  }

  /** Calls GET /v1/users/:userId/cosmetics */
  public userCosmetics(params: ForUser) {
    return this.list<PlayerCosmetic>(userPath(params, '/cosmetics'));
  }

  /** Gives a user a cosmetic. Calls POST /v1/users/:userId/cosmetics */
  public grantCosmetic(params: ForUser & { cosmetic: string }) {
    return this.http.request<{ key: string; given: boolean }>({ method: 'POST', path: userPath(params, '/cosmetics'), body: { cosmetic: params.cosmetic } });
  }

  /** Teams, highest XP first. Calls GET /v1/teams */
  public teams(params: { projectId?: string } = {}) {
    return this.list<TeamSummary & { id: string }>(projectPath(params.projectId, '/teams'));
  }

  /** Calls GET /v1/teams/:teamId/members */
  public async teamMembers(params: { teamId: string; projectId?: string }) {
    return this.list<{ userId: string; externalId: string; name: string | null; avatarUrl: string | null; xp: number; joinedAt: string }>(
      projectPath(params.projectId, `/teams/${encodeURIComponent(params.teamId)}/members`)
    );
  }

  /** Calls GET /v1/users/:userId/team */
  public async userTeam(params: ForUser): Promise<PlayerTeam | null> {
    return (await this.http.request<{ team: PlayerTeam | null }>({ method: 'GET', path: userPath(params, '/team') })).team;
  }

  /** Puts a user in a team, moving them out of any other. Calls POST /v1/users/:userId/team */
  public setTeam(params: ForUser & { team: string }) {
    return this.http.request<{ team: { key: string; name: string }; joined: boolean }>({ method: 'POST', path: userPath(params, '/team'), body: { team: params.team } });
  }

  /** Calls DELETE /v1/users/:userId/team */
  public removeFromTeam(params: ForUser) {
    return this.http.request<void>({ method: 'DELETE', path: userPath(params, '/team') });
  }

  /** Shared goals with their progress. Calls GET /v1/goals */
  public goals(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/goals'));
  }

  /** Calls GET /v1/users/:userId/goals */
  public userGoals(params: ForUser) {
    return this.list<PlayerGoal>(userPath(params, '/goals'));
  }

  /** Calls GET /v1/journeys */
  public journeys(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/journeys'));
  }

  /** Calls GET /v1/users/:userId/journeys */
  public userJourneys(params: ForUser) {
    return this.list<PlayerJourney>(userPath(params, '/journeys'));
  }

  /** Calls GET /v1/leaderboard-prizes */
  public leaderboardPrizes(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/leaderboard-prizes'));
  }

  /** Who was paid, newest first. Calls GET /v1/leaderboard-prizes/payouts */
  public leaderboardPayouts(params: { projectId?: string } = {}) {
    return this.list<Record<string, unknown>>(projectPath(params.projectId, '/leaderboard-prizes/payouts'));
  }
}
