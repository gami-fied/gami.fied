import type { HttpClient } from './http.js';
import type { AuditLogsListResponse, ListAuditLogsParams } from './types.js';

export class AuditLogsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List project-scoped audit logs with pagination and filters (Owner/Admin).
   * Calls GET /api/projects/:projectId/audit-logs
   */
  public async list(params: ListAuditLogsParams): Promise<AuditLogsListResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.auditLogs.list()');
    }

    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params.page,
      limit: params.limit,
      action: params.action,
      resourceType: params.resourceType,
      actorId: params.actorId,
      startDate: params.startDate,
      endDate: params.endDate,
    };

    return this.http.request<AuditLogsListResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/audit-logs`,
      query: queryParams,
    });
  }
}
