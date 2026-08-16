import type { HttpClient } from './http.js';
import type {
  GetUnreadCountParams,
  ListNotificationsParams,
  ListNotificationsResponse,
  MarkAllNotificationsReadParams,
  MarkNotificationReadParams,
  NotificationRecord,
  UnreadCountResponse,
} from './types.js';

export class NotificationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List user's in-app notifications (paginated, optional unreadOnly filter).
   * Calls GET /api/projects/:projectId/users/:userId/notifications
   */
  public async list(params: ListNotificationsParams): Promise<ListNotificationsResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.list()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.list()');
    }

    return this.http.request<ListNotificationsResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notifications`,
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        unreadOnly: params.unreadOnly ? 'true' : undefined,
      },
    });
  }

  /**
   * Get total count of unread notifications for a user.
   * Calls GET /api/projects/:projectId/users/:userId/notifications/unread-count
   */
  public async getUnreadCount(params: GetUnreadCountParams): Promise<UnreadCountResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.getUnreadCount()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.getUnreadCount()');
    }

    return this.http.request<UnreadCountResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notifications/unread-count`,
    });
  }

  /**
   * Mark a single notification as read.
   * Calls PATCH /api/projects/:projectId/users/:userId/notifications/:notificationId/read
   */
  public async markAsRead(params: MarkNotificationReadParams): Promise<NotificationRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.markAsRead()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.markAsRead()');
    }
    if (!params.notificationId) {
      throw new Error('notificationId is required for gami.notifications.markAsRead()');
    }

    return this.http.request<NotificationRecord>({
      method: 'PATCH',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notifications/${params.notificationId}/read`,
    });
  }

  /**
   * Mark all unread notifications as read for a user.
   * Calls POST /api/projects/:projectId/users/:userId/notifications/read-all
   */
  public async markAllAsRead(params: MarkAllNotificationsReadParams): Promise<{ count: number }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.markAllAsRead()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.markAllAsRead()');
    }

    return this.http.request<{ count: number }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notifications/read-all`,
    });
  }

  /**
   * Get user notification channel preferences.
   * Calls GET /api/projects/:projectId/users/:userId/notification-preferences
   */
  public async getPreferences(params: {
    projectId: string;
    userId: string;
  }): Promise<import('./types.js').NotificationPreferencesResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.getPreferences()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.getPreferences()');
    }

    return this.http.request<import('./types.js').NotificationPreferencesResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notification-preferences`,
    });
  }

  /**
   * Update user notification channel preferences.
   * Calls PATCH /api/projects/:projectId/users/:userId/notification-preferences
   */
  public async updatePreferences(
    params: import('./types.js').UpdateNotificationPreferencesParams
  ): Promise<import('./types.js').NotificationPreferencesResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.notifications.updatePreferences()');
    }
    if (!params.userId) {
      throw new Error('userId is required for gami.notifications.updatePreferences()');
    }

    return this.http.request<import('./types.js').NotificationPreferencesResponse>({
      method: 'PATCH',
      path: `/api/projects/${params.projectId}/users/${params.userId}/notification-preferences`,
      body: { preferences: params.preferences },
    });
  }
}
