import type { HttpClient } from './http.js';
import type {
  CreateUserParams,
  DeleteUserParams,
  GetUserByExternalIdParams,
  GetUserParams,
  ListUsersParams,
  UpdateUserParams,
  UserListResponse,
  UserRecord,
} from './types.js';

export class UsersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List project end-users with pagination and search filtering.
   * Calls GET /api/projects/:projectId/users
   */
  public async list(params: ListUsersParams): Promise<UserListResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.list()');
    }

    return this.http.request<UserListResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users`,
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        search: params.search,
      },
    });
  }

  /**
   * Retrieve basic user profile by Gami internal ID.
   * Calls GET /api/projects/:projectId/users/:userId
   */
  public async get(params: GetUserParams): Promise<UserRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.get()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.users.get()');
    }

    return this.http.request<UserRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}`,
    });
  }

  /**
   * Retrieve user profile by external ID.
   * Calls GET /api/projects/:projectId/users/by-external-id/:externalId
   */
  public async getByExternalId(params: GetUserByExternalIdParams): Promise<UserRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.getByExternalId()');
    }
    if (!params.externalId) {
      throw new Error('externalId is required for gami.users.getByExternalId()');
    }

    const encodedExternalId = encodeURIComponent(params.externalId);

    return this.http.request<UserRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/by-external-id/${encodedExternalId}`,
    });
  }

  /**
   * Manually create a new end-user in the project (Owner/Admin API Key scope).
   * Calls POST /api/projects/:projectId/users
   */
  public async create(params: CreateUserParams): Promise<UserRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.create()');
    }
    if (!params.externalId) {
      throw new Error('externalId is required for gami.users.create()');
    }

    return this.http.request<UserRecord>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/users`,
      body: {
        externalId: params.externalId,
        name: params.name,
        avatarUrl: params.avatarUrl,
        metadata: params.metadata || {},
      },
    });
  }

  /**
   * Update user profile information or reactivate a deactivated user (Owner/Admin API Key scope).
   * Calls PATCH /api/projects/:projectId/users/:userId
   */
  public async update(params: UpdateUserParams): Promise<UserRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.update()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.users.update()');
    }

    return this.http.request<UserRecord>({
      method: 'PATCH',
      path: `/api/projects/${params.projectId}/users/${params.userId}`,
      body: {
        name: params.name,
        avatarUrl: params.avatarUrl,
        metadata: params.metadata,
        active: params.active,
      },
    });
  }

  /**
   * Soft-deactivate a user while preserving historical gamification data (Owner/Admin API Key scope).
   * Calls DELETE /api/projects/:projectId/users/:userId
   */
  public async delete(
    params: DeleteUserParams
  ): Promise<{ success: boolean; message: string; user: UserRecord }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.users.delete()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.users.delete()');
    }

    return this.http.request<{ success: boolean; message: string; user: UserRecord }>({
      method: 'DELETE',
      path: `/api/projects/${params.projectId}/users/${params.userId}`,
    });
  }
}
