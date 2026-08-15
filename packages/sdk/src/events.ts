import type { HttpClient } from './http.js';
import type { EventIngestionResponse, TrackEventParams } from './types.js';

export class EventsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Track a gamification event for a user or external user ID.
   * Emits POST /v1/events to the Gami event ingestion pipeline.
   *
   * @example
   * ```ts
   * const res = await gami.events.track({
   *   projectId: 'prj_123',
   *   userId: 'usr_123',
   *   type: 'purchase',
   *   properties: { amount: 4999, productId: 'premium' }
   * });
   * ```
   */
  public async track(params: TrackEventParams): Promise<EventIngestionResponse> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.events.track()');
    }
    if (!params.type) {
      throw new Error('type is required for gami.events.track()');
    }

    const userId = params.userId || params.externalId;
    const occurredAt =
      params.occurredAt instanceof Date ? params.occurredAt.toISOString() : params.occurredAt;

    const payloadBody = {
      event: params.type,
      user_id: userId,
      payload: params.properties || {},
      occurred_at: occurredAt,
      idempotency_key: params.idempotencyKey,
    };

    return this.http.request<EventIngestionResponse>({
      method: 'POST',
      path: '/v1/events',
      body: payloadBody,
      idempotencyKey: params.idempotencyKey,
    });
  }

  /**
   * Replay an event for evaluation (Owner/Admin).
   * Calls POST /api/projects/:projectId/events/:eventId/replay
   */
  public async replay(params: { projectId: string; eventId: string }): Promise<{
    message: string;
    eventId: string;
    outboxId: string;
    replayedAt: string;
  }> {
    if (!params.projectId) {
      throw new Error('projectId is required for gami.events.replay()');
    }
    if (!params.eventId) {
      throw new Error('eventId is required for gami.events.replay()');
    }

    return this.http.request<{
      message: string;
      eventId: string;
      outboxId: string;
      replayedAt: string;
    }>({
      method: 'POST',
      path: `/api/projects/${params.projectId}/events/${params.eventId}/replay`,
    });
  }
}
