import type { HttpClient } from './http.js';
import type {
  CreateLevelParams,
  GetUserProgressParams,
  LevelRecord,
  LevelSummaryResponse,
  ListLevelsParams,
  UpdateLevelParams,
  UserProgressResponse,
} from './types.js';

export class LevelsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List configured level progression tiers in a project.
   * Calls GET /api/projects/:projectId/levels
   */
  public async list(params: ListLevelsParams): Promise<LevelRecord[]> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.list()');
    }

    return this.http.request<LevelRecord[]>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/levels`,
    });
  }

  /**
   * Get details of a specific level definition.
   * Calls GET /api/projects/:projectId/levels/:levelId
   */
  public async get(params: { projectId: string; levelId: string }): Promise<LevelRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.get()');
    }
    if (!params.levelId) {
      throw new Error('levelId is required for gami.levels.get()');
    }

    return this.http.request<LevelRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/levels/${params.levelId}`,
    });
  }

  /**
   * Create a new level progression definition (Owner/Admin).
   * Calls POST /api/projects/:projectId/levels
   */
  public async create(params: CreateLevelParams): Promise<LevelRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.create()');
    }
    if (params.level === undefined) {
      throw new Error('level is required for gami.levels.create()');
    }
    if (!params.name) {
      throw new Error('name is required for gami.levels.create()');
    }
    if (params.requiredXp === undefined) {
      throw new Error('requiredXp is required for gami.levels.create()');
    }

    return this.http.request<LevelRecord>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/levels`,
      body: {
        level: params.level,
        name: params.name,
        description: params.description,
        iconUrl: params.iconUrl,
        requiredXp: params.requiredXp,
        enabled: params.enabled,
      },
    });
  }

  /**
   * Update an existing level progression definition (Owner/Admin).
   * Calls PATCH /api/projects/:projectId/levels/:levelId
   */
  public async update(params: UpdateLevelParams): Promise<LevelRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.update()');
    }
    if (!params.levelId) {
      throw new Error('levelId is required for gami.levels.update()');
    }

    return this.http.request<LevelRecord>({
      method: 'PATCH',
      path: `/api/projects/${params.projectId}/levels/${params.levelId}`,
      body: {
        level: params.level,
        name: params.name,
        description: params.description,
        iconUrl: params.iconUrl,
        requiredXp: params.requiredXp,
        enabled: params.enabled,
      },
    });
  }

  /**
   * Get level configuration summary metrics.
   * Calls GET /api/projects/:projectId/levels/summary
   */
  public async summary(params: { projectId: string }): Promise<LevelSummaryResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.summary()');
    }

    return this.http.request<LevelSummaryResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/levels/summary`,
    });
  }

  /**
   * Get user's current level progression, required XP, and progress percentage.
   * Calls GET /api/projects/:projectId/users/:userId/levels/progress
   */
  public async getUserProgress(params: GetUserProgressParams): Promise<UserProgressResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.levels.getUserProgress()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.levels.getUserProgress()');
    }

    return this.http.request<UserProgressResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/levels/progress`,
    });
  }
}
