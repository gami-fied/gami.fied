import type { HttpClient } from './http.js';
import type { SystemMetricsResponse } from './types.js';

export class SystemResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Check lightweight API process liveness health (unauthenticated).
   * Calls GET /health
   */
  public async getHealth(): Promise<{ status: string; timestamp: string }> {
    return this.http.request<{ status: string; timestamp: string }>({
      method: 'GET',
      path: '/health',
    });
  }

  /**
   * Check deep dependency readiness (PostgreSQL and Redis health).
   * Calls GET /ready
   */
  public async getReadiness(): Promise<{
    status: string;
    postgres: string;
    redis: string;
    timestamp: string;
  }> {
    return this.http.request<{
      status: string;
      postgres: string;
      redis: string;
      timestamp: string;
    }>({
      method: 'GET',
      path: '/ready',
    });
  }

  /**
   * Get operational system & outbox metrics for a project (Owner/Admin).
   * Calls GET /api/projects/:projectId/system/metrics
   */
  public async getMetrics(params: { projectId: string }): Promise<SystemMetricsResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.system.getMetrics()');
    }

    return this.http.request<SystemMetricsResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/system/metrics`,
    });
  }
}
