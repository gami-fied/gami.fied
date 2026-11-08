import { projectPath, type HttpClient } from './http.js';
import type {
  ListStreaksParams,
  ListUserStreaksParams,
  StreakChangeRecord,
  StreakDefinitionRecord,
  StreakHistoryParams,
  UserStreakRecord,
} from './types.js';

export class StreaksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List the streaks defined in the project.
   * Calls GET /v1/streaks
   */
  public async list(params: ListStreaksParams = {}): Promise<StreakDefinitionRecord[]> {
    const res = await this.http.request<{ data: StreakDefinitionRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, '/streaks'),
    });
    return res.data ?? [];
  }

  /**
   * A user's progress on each enabled streak, read as of now. A streak that has ended reads 0
   * before the user's next action, and `atRisk` is true when they have not yet been active today
   * (or this week, for a weekly streak).
   * Calls GET /v1/users/:userId/streaks
   */
  public async forUser(params: ListUserStreaksParams): Promise<UserStreakRecord[]> {
    if (!params.userId) throw new Error('userId is required for gami.streaks.forUser()');

    const res = await this.http.request<{ data: UserStreakRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${encodeURIComponent(params.userId)}/streaks`),
    });
    return res.data ?? [];
  }

  /**
   * When a user's streaks started, grew, were saved by a freeze, or ended. Newest first.
   * Calls GET /v1/users/:userId/streaks/history
   */
  public async history(params: StreakHistoryParams): Promise<StreakChangeRecord[]> {
    if (!params.userId) throw new Error('userId is required for gami.streaks.history()');

    const query = new URLSearchParams();
    if (params.streak) query.set('streak', params.streak);
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    const res = await this.http.request<{ data: StreakChangeRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${encodeURIComponent(params.userId)}/streaks/history${suffix}`),
    });
    return res.data ?? [];
  }
}
