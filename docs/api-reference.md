# Gami.Fied API Reference

The Gami.Fied Community Engine provides a high-performance REST API for gamification event ingestion, user management, rules evaluation, XP awards, achievements, progression levels, leaderboards, notifications, webhooks, and integrations.

## Core API Endpoints

### 1. Event Ingestion (`POST /v1/events`)
Ingest a user activity event for real-time gamification evaluation.

- **URL**: `POST /v1/events`
- **Authentication**: `x-api-key: gami_pk_live_REPLACE_ME`
- **Headers**: `Idempotency-Key: <unique-uuid>` (Optional, Recommended)
- **Request Body**:
```json
{
  "event": "purchase",
  "user_id": "usr_external_123",
  "payload": {
    "amount": 4999,
    "currency": "USD"
  }
}
```
- **Response (`202 Accepted`)**:
```json
{
  "id": "evt_1724001122_a1b2c3d4",
  "status": "accepted",
  "duplicate": false
}
```

> [!NOTE]
> `202 Accepted` indicates the event has been safely stored and queued in the transactional outbox for asynchronous processing. Side effects (XP awards, level ups, achievement unlocks) are evaluated asynchronously.

### 2. Project API Usage Metrics (`GET /api/projects/:projectId/metrics`)
Retrieve project-scoped API activity and ingestion volume.

- **URL**: `GET /api/projects/:projectId/metrics`
- **Authentication**: Session Cookie or Project Authorization Header
- **Response (`200 OK`)**:
```json
{
  "projectId": "prj_123",
  "projectName": "My Community App",
  "timestamp": "2026-08-18T22:45:00.000Z",
  "eventsIngested": 1250,
  "requests": {
    "received": 1250,
    "successful": 1250,
    "failed": 0,
    "rateLimited": 0
  }
}
```

### 3. Engine Health Probes
- `GET /health` - Liveness check (`200 OK`)
- `GET /ready` - Deep PostgreSQL & Redis readiness probe (`200 OK` / `503 Service Unavailable`)
- `GET /openapi.json` - Canonical OpenAPI 3.1 JSON Specification
