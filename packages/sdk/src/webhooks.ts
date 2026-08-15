import type { HttpClient } from './http.js';
import type {
  CreateWebhookParams,
  DeleteWebhookParams,
  GetWebhookParams,
  ListWebhookDeliveriesParams,
  ListWebhooksParams,
  ReplayWebhookDeliveryParams,
  RotateWebhookSecretParams,
  TestWebhookParams,
  UpdateWebhookParams,
  WebhookDeliveryRecord,
  WebhookDeliveryListResponse,
  WebhookEndpointRecord,
} from './types.js';

export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all registered webhook endpoints for a project (Member+).
   * Calls GET /api/projects/:projectId/webhooks
   */
  public async list(params: ListWebhooksParams): Promise<WebhookEndpointRecord[]> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.list()');
    }

    return this.http.request<WebhookEndpointRecord[]>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/webhooks`,
    });
  }

  /**
   * Get single webhook endpoint details by ID (Member+).
   * Calls GET /api/projects/:projectId/webhooks/:webhookId
   */
  public async get(params: GetWebhookParams): Promise<WebhookEndpointRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.get()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.get()');
    }

    return this.http.request<WebhookEndpointRecord>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}`,
    });
  }

  /**
   * Create a new webhook endpoint and subscribe to events (Owner/Admin).
   * Returns secret ONLY ONCE in the response.
   * Calls POST /api/projects/:projectId/webhooks
   */
  public async create(
    params: CreateWebhookParams
  ): Promise<WebhookEndpointRecord & { secret: string }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.create()');
    }
    if (!params.url) {
      throw new Error('url is required for gami.webhooks.create()');
    }
    if (!params.name) {
      throw new Error('name is required for gami.webhooks.create()');
    }
    if (!params.events || params.events.length === 0) {
      throw new Error('at least one event subscription is required for gami.webhooks.create()');
    }

    return this.http.request<WebhookEndpointRecord & { secret: string }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/webhooks`,
      body: {
        name: params.name,
        url: params.url,
        description: params.description,
        events: params.events,
      },
    });
  }

  /**
   * Update webhook endpoint configuration or active status (Owner/Admin).
   * Calls PATCH /api/projects/:projectId/webhooks/:webhookId
   */
  public async update(params: UpdateWebhookParams): Promise<WebhookEndpointRecord> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.update()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.update()');
    }

    return this.http.request<WebhookEndpointRecord>({
      method: 'PATCH',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}`,
      body: {
        name: params.name,
        url: params.url,
        description: params.description,
        active: params.active,
        events: params.events,
      },
    });
  }

  /**
   * Soft-deactivate/delete a webhook endpoint (Owner/Admin).
   * Calls DELETE /api/projects/:projectId/webhooks/:webhookId
   */
  public async delete(params: DeleteWebhookParams): Promise<{ success: boolean; message: string }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.delete()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.delete()');
    }

    return this.http.request<{ success: boolean; message: string }>({
      method: 'DELETE',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}`,
    });
  }

  /**
   * Rotate webhook endpoint signing secret (Owner/Admin).
   * Returns new secret ONLY ONCE.
   * Calls POST /api/projects/:projectId/webhooks/:webhookId/rotate-secret
   */
  public async rotateSecret(
    params: RotateWebhookSecretParams
  ): Promise<{ id: string; secret: string; message: string }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.rotateSecret()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.rotateSecret()');
    }

    return this.http.request<{ id: string; secret: string; message: string }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}/rotate-secret`,
    });
  }

  /**
   * Queue a test webhook delivery (Owner/Admin).
   * Calls POST /api/projects/:projectId/webhooks/:webhookId/test
   */
  public async test(
    params: TestWebhookParams
  ): Promise<{ success: boolean; message: string; deliveriesQueued: number }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.test()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.test()');
    }

    return this.http.request<{ success: boolean; message: string; deliveriesQueued: number }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}/test`,
    });
  }

  /**
   * List delivery history for a webhook endpoint (Member+).
   * Calls GET /api/projects/:projectId/webhooks/:webhookId/deliveries
   */
  public async listDeliveries(
    params: ListWebhookDeliveriesParams
  ): Promise<WebhookDeliveryListResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.listDeliveries()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.listDeliveries()');
    }

    return this.http.request<WebhookDeliveryListResponse>({
      method: 'GET',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}/deliveries`,
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        status: params.status,
        eventType: params.eventType,
      },
    });
  }

  /**
   * Replay a historical webhook delivery attempt (Owner/Admin).
   * Calls POST /api/projects/:projectId/webhooks/:webhookId/deliveries/:deliveryId/replay
   */
  public async replayDelivery(
    params: ReplayWebhookDeliveryParams
  ): Promise<{ success: boolean; message: string; newDeliveryId: string }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.webhooks.replayDelivery()');
    }
    if (!params.webhookId) {
      throw new Error('webhookId is required for gami.webhooks.replayDelivery()');
    }
    if (!params.deliveryId) {
      throw new Error('deliveryId is required for gami.webhooks.replayDelivery()');
    }

    return this.http.request<{ success: boolean; message: string; newDeliveryId: string }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/webhooks/${params.webhookId}/deliveries/${params.deliveryId}/replay`,
    });
  }
}
