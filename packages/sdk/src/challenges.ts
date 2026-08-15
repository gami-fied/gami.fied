import type { HttpClient } from './http.js';
import type {
  ChallengeRecord,
  ChallengeSummaryResponse,
  GetChallengeParams,
  ListChallengesParams,
  ListUserChallengesParams,
  UserChallengeProgressRecord,
} from './types.js';

export class ChallengesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all configured challenges and quests in a project.
   * Calls GET /api/projects/:projectId/challenges
   */
  public async list(params: ListChallengesParams): Promise<ChallengeRecord[]> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.challenges.list()');
    }

    return this.http.request<ChallengeRecord[]>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/challenges`,
    });
  }

  /**
   * Get details of a single challenge definition.
   * Calls GET /api/projects/:projectId/challenges/:challengeId
   */
  public async get(params: GetChallengeParams): Promise<ChallengeRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.challenges.get()');
    }
    if (!params.challengeId) {
      throw new Error('challengeId is required for gami.challenges.get()');
    }

    return this.http.request<ChallengeRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/challenges/${params.challengeId}`,
    });
  }

  /**
   * Get project challenge summary metrics.
   * Calls GET /api/projects/:projectId/challenges/summary
   */
  public async summary(params: { projectId: string }): Promise<ChallengeSummaryResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.challenges.summary()');
    }

    return this.http.request<ChallengeSummaryResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/challenges/summary`,
    });
  }

  /**
   * List a user's active challenge progress & completed status.
   * Calls GET /api/projects/:projectId/users/:userId/challenges
   */
  public async listForUser(
    params: ListUserChallengesParams
  ): Promise<UserChallengeProgressRecord[]> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.challenges.listForUser()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.challenges.listForUser()');
    }

    return this.http.request<UserChallengeProgressRecord[]>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/challenges`,
    });
  }

  /**
   * Get user's progress for a specific challenge.
   * Calls GET /api/projects/:projectId/users/:userId/challenges/:challengeId
   */
  public async getForUser(params: {
    projectId: string;
    userId: string;
    challengeId: string;
  }): Promise<UserChallengeProgressRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.challenges.getForUser()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.challenges.getForUser()');
    }
    if (!params.challengeId) {
      throw new Error('challengeId is required for gami.challenges.getForUser()');
    }

    return this.http.request<UserChallengeProgressRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/challenges/${params.challengeId}`,
    });
  }
}
