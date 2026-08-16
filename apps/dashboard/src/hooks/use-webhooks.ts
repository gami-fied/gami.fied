'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CreateWebhookParams,
  UpdateWebhookParams,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
} from '@gami.fied/sdk';

export function useWebhooks(projectId: string | null) {
  const [endpoints, setEndpoints] = useState<WebhookEndpointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEndpoints = useCallback(async () => {
    if (!projectId) {
      setEndpoints([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/webhooks`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to fetch webhooks');
      }

      const data = await res.json();
      setEndpoints(data || []);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchEndpoints();
  }, [projectId, fetchEndpoints]);

  const createEndpoint = async (
    input: Omit<CreateWebhookParams, 'projectId'>
  ): Promise<WebhookEndpointRecord & { secret: string }> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(`/api/projects/${projectId}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to create webhook');
    }

    const created = await res.json();
    await fetchEndpoints();
    return created;
  };

  const updateEndpoint = async (
    webhookId: string,
    input: Omit<UpdateWebhookParams, 'projectId' | 'webhookId'>
  ): Promise<WebhookEndpointRecord> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to update webhook');
    }

    const updated = await res.json();
    await fetchEndpoints();
    return updated;
  };

  const deleteEndpoint = async (webhookId: string): Promise<void> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to delete webhook');
    }

    await fetchEndpoints();
  };

  const rotateSecret = async (
    webhookId: string
  ): Promise<{ id: string; secret: string; message: string }> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}/rotate-secret`, {
      method: 'POST',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to rotate secret');
    }

    return await res.json();
  };

  const testWebhook = async (webhookId: string): Promise<{ success: boolean; message: string }> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(`/api/projects/${projectId}/webhooks/${webhookId}/test`, {
      method: 'POST',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to send test webhook');
    }

    return await res.json();
  };

  const fetchDeliveries = async (
    webhookId: string,
    page = 1,
    limit = 25,
    status?: string,
    eventType?: string
  ): Promise<{ page: number; limit: number; total: number; deliveries: WebhookDeliveryRecord[] }> => {
    if (!projectId) throw new Error('No project selected');

    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) query.set('status', status);
    if (eventType) query.set('eventType', eventType);

    const res = await fetch(
      `/api/projects/${projectId}/webhooks/${webhookId}/deliveries?${query.toString()}`
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to fetch webhook delivery history');
    }

    return await res.json();
  };

  const replayDelivery = async (
    webhookId: string,
    deliveryId: string
  ): Promise<{ success: boolean; message: string; newDeliveryId: string }> => {
    if (!projectId) throw new Error('No project selected');

    const res = await fetch(
      `/api/projects/${projectId}/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
      { method: 'POST' }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to replay delivery');
    }

    return await res.json();
  };

  return {
    endpoints,
    loading,
    error,
    refresh: fetchEndpoints,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    rotateSecret,
    testWebhook,
    fetchDeliveries,
    replayDelivery,
  };
}
