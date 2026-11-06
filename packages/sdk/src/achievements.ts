import { projectPath, type HttpClient } from './http.js';
import type {
  AchievementRecord,
  AchievementSummaryResponse,
  GetAchievementParams,
  ListAchievementsParams,
  ListUserAchievementsParams,
  UserAchievementRecord,
} from './types.js';

export class AchievementsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all configured achievements in a project.
   * Calls GET /api/projects/:projectId/achievements
   */
  public async list(params: ListAchievementsParams): Promise<AchievementRecord[]> {

    const res = await this.http.request<AchievementRecord[] | { data: AchievementRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/achievements`),
    });

    return Array.isArray(res) ? res : res.data || [];
  }

  /**
   * Get details of a single achievement by ID.
   * Calls GET /api/projects/:projectId/achievements/:achievementId
   */
  public async get(params: GetAchievementParams): Promise<AchievementRecord> {
    if (!params.achievementId) {
      throw new Error('achievementId is required for gami.achievements.get()');
    }

    return this.http.request<AchievementRecord>({
      method: 'GET',
      path: projectPath(params.projectId, `/achievements/${params.achievementId}`),
    });
  }

  /**
   * Get achievement metrics & summary analytics.
   * Calls GET /api/projects/:projectId/achievements/summary
   */
  public async summary(params: { projectId?: string }): Promise<AchievementSummaryResponse> {

    return this.http.request<AchievementSummaryResponse>({
      method: 'GET',
      path: projectPath(params.projectId, `/achievements/summary`),
    });
  }

  /**
   * List all achievements unlocked by a specific user.
   * Calls GET /api/projects/:projectId/users/:userId/achievements
   */
  public async listForUser(params: ListUserAchievementsParams): Promise<UserAchievementRecord[]> {
    if (!params.userId) {
      throw new Error('userId is required for gami.achievements.listForUser()');
    }

    const res = await this.http.request<{ data: UserAchievementRecord[] }>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${params.userId}/achievements`),
    });

    return res.data;
  }

  /**
   * Get specific user achievement unlock status.
   * Calls GET /api/projects/:projectId/users/:userId/achievements/:achievementId
   */
  public async getForUser(params: {
    projectId?: string;
    userId: string;
    achievementId: string;
  }): Promise<UserAchievementRecord> {
    if (!params.userId) {
      throw new Error('userId is required for gami.achievements.getForUser()');
    }
    if (!params.achievementId) {
      throw new Error('achievementId is required for gami.achievements.getForUser()');
    }

    return this.http.request<UserAchievementRecord>({
      method: 'GET',
      path: projectPath(params.projectId, `/users/${params.userId}/achievements/${params.achievementId}`),
    });
  }
}
