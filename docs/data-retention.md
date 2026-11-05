# Data retention

The worker removes old data every 6 hours. Work still in progress is never removed.

Settings live in the `retention` category. Set them with `PATCH /api/admin/config`:

```json
{ "category": "retention", "payload": { "outboxDays": 30, "eventDays": 365 } }
```

A save replaces the whole category, so include every value you want to keep.

| Setting | Default | What it removes |
| :--- | :--- | :--- |
| `outboxDays` | 30 | Finished webhook, email, notification, event, integration and reward outbox rows |
| `ruleExecutionDays` | 90 | Rule execution records |
| `notificationDays` | 0 (keep) | In-app notifications |
| `eventDays` | 0 (keep) | Events |
| `backupIntervalHours` | 0 (off) | Hours between scheduled backups |
| `backupKeepCount` | 7 | Scheduled backups to keep |

Removing events doesn't change XP balances. Ledger rows stay, and they just lose their link to the event.

Audit logs are never removed automatically.

## Erasing a user

`DELETE /api/projects/:projectId/users/:userId` only deactivates a user. To remove them permanently for a GDPR or CCPA request:

```bash
curl -X POST "$API_URL/api/projects/$PROJECT_ID/users/$USER_ID/erase" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "confirm": true }'
```

This deletes the user with their events, XP, achievements, challenge progress, notifications and queued webhooks. It can't be undone. An audit log records that an erasure happened, with only the internal user ID.

Existing backups still hold the user until they are removed, so keep your backup retention in step with your privacy policy.
