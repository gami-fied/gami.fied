import type { HttpClient } from './http.js';
import type {
  CreateIntegrationParams,
  DiscordEmbedTemplate,
  GetTemplatesResponse,
  IntegrationDeliveryRecord,
  IntegrationRecord,
  ListIntegrationDeliveriesParams,
  ListIntegrationDeliveriesResponse,
  PreviewTemplateParams,
  PreviewTemplateResponse,
  UpdateIntegrationParams,
  UpdateTemplatesParams,
} from './types.js';

export class IntegrationsResource {
  constructor(private readonly http: HttpClient) {}

  public async list(projectId: string): Promise<IntegrationRecord[]> {
    const res = await this.http.request<{ integrations: IntegrationRecord[] }>({
      method: 'GET',
      path: `/api/projects/${projectId}/integrations`,
    });
    return res.integrations;
  }

  public async get(projectId: string, integrationId: string): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'GET',
      path: `/api/projects/${projectId}/integrations/${integrationId}`,
    });
    return res.integration;
  }

  public async create(
    projectId: string,
    params: CreateIntegrationParams
  ): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations`,
      body: params,
    });
    return res.integration;
  }

  public async update(
    projectId: string,
    integrationId: string,
    params: UpdateIntegrationParams
  ): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'PATCH',
      path: `/api/projects/${projectId}/integrations/${integrationId}`,
      body: params,
    });
    return res.integration;
  }

  public async delete(projectId: string, integrationId: string): Promise<boolean> {
    const res = await this.http.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/api/projects/${projectId}/integrations/${integrationId}`,
    });
    return res.success;
  }

  public async enable(projectId: string, integrationId: string): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/enable`,
    });
    return res.integration;
  }

  public async disable(projectId: string, integrationId: string): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/disable`,
    });
    return res.integration;
  }

  public async test(projectId: string, integrationId: string): Promise<boolean> {
    const res = await this.http.request<{ success: boolean }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/test`,
    });
    return res.success;
  }

  public async listDeliveries(
    projectId: string,
    integrationId: string,
    params?: ListIntegrationDeliveriesParams
  ): Promise<ListIntegrationDeliveriesResponse> {
    return this.http.request<ListIntegrationDeliveriesResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/integrations/${integrationId}/deliveries`,
      query: {
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
      },
    });
  }

  public async replayDelivery(
    projectId: string,
    integrationId: string,
    deliveryId: string
  ): Promise<IntegrationDeliveryRecord> {
    const res = await this.http.request<{ success: boolean; delivery: IntegrationDeliveryRecord }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/deliveries/${deliveryId}/replay`,
    });
    return res.delivery;
  }

  public async getTemplates(
    projectId: string,
    integrationId: string
  ): Promise<GetTemplatesResponse> {
    return this.http.request<GetTemplatesResponse>({
      method: 'GET',
      path: `/api/projects/${projectId}/integrations/${integrationId}/templates`,
    });
  }

  public async updateTemplates(
    projectId: string,
    integrationId: string,
    params: UpdateTemplatesParams
  ): Promise<IntegrationRecord> {
    const res = await this.http.request<{ integration: IntegrationRecord }>({
      method: 'PUT',
      path: `/api/projects/${projectId}/integrations/${integrationId}/templates`,
      body: params,
    });
    return res.integration;
  }

  public async resetTemplates(
    projectId: string,
    integrationId: string,
    eventType?: string
  ): Promise<IntegrationRecord> {
    const res = await this.http.request<{ success: boolean; integration: IntegrationRecord }>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/templates/reset`,
      body: { eventType },
    });
    return res.integration;
  }

  public async previewTemplate(
    projectId: string,
    integrationId: string,
    params: PreviewTemplateParams
  ): Promise<PreviewTemplateResponse> {
    return this.http.request<PreviewTemplateResponse>({
      method: 'POST',
      path: `/api/projects/${projectId}/integrations/${integrationId}/templates/preview`,
      body: params,
    });
  }
}
