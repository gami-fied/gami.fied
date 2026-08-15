import type { HttpClient } from './http.js';
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
    if (!params.projectId) {
      throw new Error('projectId is required for gami.leaderboards.list()');
    }

    return this.http.request<ListLeaderboardResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/leaderboards`,
      query: {
        period: params.period ?? 'all_time',
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        search: params.search,
      },
    });
  }

  /**
   * Get user's specific leaderboard rank position and XP total.
   * Calls GET /api/projects/:projectId/users/:userId/rank
   */
  public async getUserRank(params: GetUserRankParams): Promise<UserRankResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.leaderboards.getUserRank()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.leaderboards.getUserRank()');
    }

    return this.http.request<UserRankResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/rank`,
      query: {
        period: params.period ?? 'all_time',
      },
    });
  }
}
