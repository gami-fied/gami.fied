# Project Audit Logs

Gami automatically records an immutable, project-isolated audit trail for all administrative actions across the platform.

## Redaction Shield

To prevent accidental leak of sensitive credentials, all audit record `metadata` payloads pass through `redactSensitiveData()`.

The following keys are automatically replaced with `'[REDACTED]'`:
- Passwords & DB connection strings
- API keys & secrets (`x-api-key`, `apiKey`, `keySecret`)
- Webhook signing secrets (`webhookSecret`, `masterKey`)
- Authentication tokens & cookies

## Recorded Audit Actions

- `user.created`, `user.updated`, `user.deactivated`, `user.reactivated`
- `rule.created`, `rule.updated`, `rule.deleted`
- `achievement.created`, `achievement.updated`
- `challenge.created`, `challenge.updated`, `challenge.deleted`
- `api_key.created`, `api_key.revoked`
- `webhook.created`, `webhook.updated`, `webhook.deleted`, `webhook.secret_rotated`, `webhook.delivery_replayed`
- `xp.manually_adjusted`
- `event.replayed`

## Audit Logs API

```http
GET /api/projects/:projectId/audit-logs
```
*Requires Owner or Admin role.*

### Query Parameters

- `page`: Page number (default `1`)
- `limit`: Items per page (default `20`, max `100`)
- `action`: Filter by action (e.g. `user.created`)
- `resourceType`: Filter by resource (e.g. `rule`)
- `actorId`: Filter by actor user ID
- `startDate`: ISO 8601 start timestamp filter
- `endDate`: ISO 8601 end timestamp filter
