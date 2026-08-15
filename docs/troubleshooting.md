# Troubleshooting & Operations Guide

Operational guide for outbox recovery, event replay semantics, worker heartbeat troubleshooting, and production configuration validation.

## 1. Event Replay & Idempotency Rules

To replay an event for re-evaluation:

```http
POST /api/projects/:projectId/events/:eventId/replay
```

### Key Replay Guarantees
- Replaying an **unprocessed or failed event** resets its outbox record status to `'pending'` for immediate worker pick-up.
- Replaying a **previously processed event** re-enqueues an evaluation intent while preserving event ID lineage.
- **Idempotency Safeguard**: Replay does **NOT** duplicate side-effect rewards (XP, achievements, challenge progress, or notifications). All existing unique constraint indexes (`xpLedger.idempotencyKey`, `user_achievements` unique key, `user_challenge_progress` unique key) remain strictly active during replay.

## 2. Stale Outbox Record Recovery

The background worker automatically scans for outbox records stuck in `processing` status for > 5 minutes across all 4 outboxes:
- `event_outbox`
- `challenge_reward_outbox`
- `notification_outbox`
- `webhook_outbox`

Stale records are automatically reclaimed back to `pending` status so surviving worker instances can finish delivery without manual database intervention.

## 3. Production Configuration Validation Errors

When starting Gami with `NODE_ENV=production`, `validateProductionConfig()` checks critical environment variables before opening HTTP ports:

- `DATABASE_URL`: Must be set and must not use insecure default credentials (`postgres:postgres`).
- `BETTER_AUTH_SECRET`: Must be set and at least 16 characters.
- `WEBHOOK_MASTER_KEY`: Must be set and must not use the default fallback string.
- `REDIS_HOST`: Must be set.

If any variable fails validation, the API process exits immediately with a clean descriptive error message without exposing sensitive secrets in server logs.
