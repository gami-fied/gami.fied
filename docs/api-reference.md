# API reference

The full reference is in the dashboard under **Connect > API Docs**, with every parameter, body, response and error, and samples in cURL, JavaScript and Python. The same information is in [`openapi.json`](./openapi.json), which you can load into any OpenAPI tool. A running server also serves it at `GET /openapi.json`.

This page covers the basics.

## Public API

Routes under `/v1` are the stable public API.

- The API key identifies the project, so paths don't include a project ID.
- Any `{userId}` in a path accepts your own ID for the user, or their Gami.Fied ID.
- Routes under `/api/projects` serve the dashboard and can change without notice.

| Area | Routes |
| :--- | :--- |
| Events | `POST /v1/events`, `POST /v1/events/batch` |
| Users | `/v1/users`, including create, update, deactivate and erase |
| XP | `/v1/users/{userId}/xp`, its ledger and adjustments, and `/v1/xp/summary` |
| Levels | `/v1/levels`, `/v1/users/{userId}/progress` and `/v1/progression/summary` |
| Achievements | `/v1/achievements` and `/v1/users/{userId}/achievements` |
| Challenges | `/v1/challenges` and `/v1/users/{userId}/challenges` |
| Leaderboard | `/v1/leaderboard` and `/v1/leaderboard/{userId}` |
| Current user | `POST /v1/end-user-tokens` and `/v1/me`, for browsers |

## Sending an event

```bash
curl -X POST https://api.example.com/v1/events \
  -H "x-api-key: gami_live_REPLACE_ME" \
  -H "Idempotency-Key: order-4821" \
  -H "Content-Type: application/json" \
  -d '{ "event": "purchase", "user_id": "user_123", "payload": { "amount": 4999 } }'
```

```json
{ "id": "evt_1724001122_a1b2c3d4", "status": "accepted", "duplicate": false }
```

> [!NOTE]
> `202 Accepted` means the event is stored and queued. XP, levels and achievements are worked out in the background.

## Health checks

These need no authentication:

- `GET /health`: the process is running.
- `GET /ready`: PostgreSQL and Redis are reachable. Returns `503` if not.

## Project usage

`GET /api/projects/:projectId/metrics` returns a project's API activity. It needs a signed-in user, or an API key with the `system:read` scope.

```json
{
  "projectId": "prj_123",
  "projectName": "My Community App",
  "timestamp": "2026-08-18T22:45:00.000Z",
  "eventsIngested": 1250,
  "requests": { "received": 1250, "successful": 1250, "failed": 0, "rateLimited": 0 }
}
```

## Related guides

- [Authentication](./api-authentication.md)
- [Errors](./api-errors.md)
- [Idempotency](./idempotency.md)
- [Request IDs](./request-ids.md)
- [Versioning](./api-versioning.md)
- [TypeScript SDK](./sdk.md)
