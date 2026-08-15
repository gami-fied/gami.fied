# System Observability & Metrics

Gami provides structured observability, separation of process metrics from database state, live worker heartbeats, BullMQ metrics, and authoritative outbox status metrics.

## Architectural Metrics Separation

1. **In-Memory Process Metrics (`processMetrics`)**:
   - `events_ingested_total`
   - `events_processed_total`
   - `events_failed_total`
   - `rules_evaluated_total`
   - `rules_matched_total`
   - `xp_awarded_total`
   - `achievements_unlocked_total`
   - `challenges_completed_total`
   - `webhook_deliveries_total`
   - Low-cardinality HTTP route traffic & error histogram (`httpRouteStats`)

2. **Authoritative Database-Backed Outbox Operational State**:
   Calculated directly from PostgreSQL when requested to ensure worker restarts never reset outbox pending counts to zero:
   - `eventOutboxPending`
   - `challengeRewardOutboxPending`
   - `notificationOutboxPending`
   - `webhookOutboxPending`
   - `staleProcessingRecords` (Records stuck in `processing` status > 5 min)

## Redis Worker Heartbeat

Background workers periodically update a Redis heartbeat key (`gami:worker:heartbeat:<workerId>`) with a TTL of 30 seconds:
- Emits `workerId`, `timestamp`, `status` (`'alive'` | `'stopping'`), `lastProcessedAt`, and `processedCount`.
- Monitored by the System Metrics API and Admin Dashboard (`/dashboard/system`).

## System Metrics Endpoint

```http
GET /api/projects/:projectId/system/metrics
```
*Requires Owner or Admin role.*

### Response Example

```json
{
  "projectId": "prj_123456",
  "timestamp": "2026-08-15T23:20:00.000Z",
  "health": {
    "api": "healthy",
    "postgres": "healthy",
    "redis": "healthy",
    "worker": "healthy",
    "workerAlive": true,
    "workerHeartbeat": {
      "workerId": "worker_1786655000_a1b2",
      "timestamp": "2026-08-15T23:19:58.000Z",
      "status": "alive",
      "lastProcessedAt": "2026-08-15T23:19:50.000Z",
      "processedCount": 42
    }
  },
  "outbox": {
    "eventOutboxPending": 0,
    "challengeRewardOutboxPending": 0,
    "notificationOutboxPending": 0,
    "webhookOutboxPending": 0,
    "staleProcessingRecords": 0
  },
  "queue": {
    "waiting": 0,
    "active": 0,
    "completed": 42,
    "failed": 0,
    "delayed": 0
  }
}
```
