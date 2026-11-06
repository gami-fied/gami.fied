# Event Ingestion Idempotency

An `Idempotency-Key` makes a retry safe, so the same event is never recorded twice.

## Overview

When sending events via `POST /v1/events`, network timeouts or retries can cause identical requests to be sent multiple times. Idempotency guarantees that retried requests do not award duplicate XP, unlock achievements twice, or progress challenges multiple times.

## How to Use Idempotency Keys

Include an `Idempotency-Key` header of up to 128 characters with your request. You can send `idempotency_key` in the body instead, and the header wins if both are present. In a batch, use `idempotency_key` on each event.

```http
POST /v1/events HTTP/1.1
Host: api.example.com
Content-Type: application/json
x-api-key: gami_live_REPLACE_ME
Idempotency-Key: 7b9e1d2c-8a3f-4e5d-b6a1-9c8d7e6f5a4b

{
  "event": "purchase",
  "user_id": "usr_123",
  "payload": { "amount": 4999 }
}
```

## Idempotency Behavior Rules

1. **First Request**: Stores the event in PostgreSQL and returns `202 Accepted` with `duplicate: false`.
2. **Identical Retry**: Returns `202 Accepted` with `duplicate: true` and the existing event ID without re-executing outbox or gamification logic.
3. **Concurrent Duplicate Requests**: Safely handled at the PostgreSQL database level using the `(projectId, idempotencyKey)` unique constraint.
4. **Payload Mismatch (`409 Conflict`)**: If the same `Idempotency-Key` is reused with a different event type or payload, the API returns `409 Conflict` (`IDEMPOTENCY_KEY_MISMATCH`).
5. **Project Scoping**: Idempotency keys are strictly isolated per project.

## XP adjustments

`POST /v1/users/{userId}/xp/adjust` also accepts an `Idempotency-Key` header or `idempotencyKey` field. Repeating a key returns the original entry with `duplicate: true` and status `200`, rather than `201`, and doesn't change the balance.
