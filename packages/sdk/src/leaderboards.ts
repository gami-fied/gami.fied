import { projectPath, type HttpClient } from './http.js';
import type { GroupLeaderboardRecord } from './community.js';
import type {
  GetUserRankParams,
  ListLeaderboardParams,
  ListLeaderboardResponse,
  UserRankResponse,
} from './types.js';

export class LeaderboardsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get project leaderboard rankings (paginated).
   * Calls GET /api/projects/:projectId/leaderboards
   */
  public async list(params: ListLeaderboardParams): Promise<ListLeaderboardResponse> {

    return this.http.request<ListLeaderboardResponse>({
      method: 'GET',
      path: projectPath(params.projectId, `/leaderboard`),
      query: {
        period: params.period ?? 'all_time',
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        search: params.search,
        segment: params.segment,
        friendsOf: params.friendsOf,
      },
    });
  }

  /**
   * Teams, countries or any other attribute ranked against each other, such as `metadata.team`.
   * `score: 'average'` divides by the members, so small groups can win.
   */
  public async groups(params: { projectId?: string; groupBy: string; period?: ListLeaderboardParams['period']; score?: 'total' | 'average'; segment?: string; limit?: number }): Promise<GroupLeaderboardRecord> {
    if (!params.groupBy) throw new Error('groupBy is required for gami.leaderboards.groups()');
    return this.http.request<GroupLeaderboardRecord>({
      method: 'GET',
      path: projectPath(params.projectId, '/leaderboard'),
      query: { groupBy: params.groupBy, period: params.period ?? 'all_time', score: params.score, segment: params.segment, limit: params.limit },
    });
  }

  /**
   * Get user's specific leaderboard rank position and XP total.
   * Calls GET /api/projects/:projectId/users/:userId/rank
   */
  public async getUserRank(params: GetUserRankParams): Promise<UserRankResponse> {
    if (!params.userId) {
      throw new Error('userId is required for gami.leaderboards.getUserRank()');
    }

    return this.http.request<UserRankResponse>({
      method: 'GET',
      path: projectPath(params.projectId, `/leaderboard/${params.userId}`),
      query: {
        period: params.period ?? 'all_time',
      },
    });
  }
}
