import type { HttpClient } from './http.js';
import type {
  AnalyticsEventsResponse,
  AnalyticsGamificationResponse,
  AnalyticsIntegrationsResponse,
  AnalyticsNotificationsResponse,
  AnalyticsOverviewResponse,
  AnalyticsQueryOptions,
  AnalyticsUsersResponse,
} from './types.js';

export class AnalyticsResource {
  constructor(private http: HttpClient) {}

  /**
   * Fetch overview metrics (users, events, XP, achievements, challenges) for a project.
   */
  async getOverview(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsOverviewResponse> {
    return this.http.request<AnalyticsOverviewResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/overview`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Fetch user growth, new user, and active user metrics.
   */
  async getUsers(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsUsersResponse> {
    return this.http.request<AnalyticsUsersResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/users`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Fetch event volume trend and top event types.
   */
  async getEvents(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsEventsResponse> {
    return this.http.request<AnalyticsEventsResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/events`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Fetch gamification metrics (XP awarded, top achievements, challenges, top rules).
   */
  async getGamification(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsGamificationResponse> {
    return this.http.request<AnalyticsGamificationResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/gamification`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Fetch in-app and email notification metrics.
   */
  async getNotifications(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsNotificationsResponse> {
    return this.http.request<AnalyticsNotificationsResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/notifications`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Fetch webhook and external integration delivery status metrics.
   */
  async getIntegrations(projectId: string, options?: AnalyticsQueryOptions): Promise<AnalyticsIntegrationsResponse> {
    return this.http.request<AnalyticsIntegrationsResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/integrations`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }

  /**
   * Download CSV analytics report as string.
   */
  async export(projectId: string, options?: AnalyticsQueryOptions): Promise<string> {
    return this.http.request<string>({
      method: 'GET',
      path: `/api/projects/${projectId}/analytics/export`,
      query: options as Record<string, string | number | boolean | undefined | null>,
    });
  }
}
