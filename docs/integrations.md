# Gami External Integration Framework Architecture

## Overview
Gami's External Integration Framework allows connecting canonical gamification notification events (`xp_awarded`, `achievement_unlocked`, `level_up`, `challenge_completed`) to external messaging platforms and channels (Discord, Slack, Teams) without modifying core gamification transaction semantics or the canonical notification pipeline.

---

## Architecture Guarantees

1. **Transaction Isolation**:
   External delivery intents are recorded asynchronously in the `integration_deliveries` outbox table. Failures or rate limits on external services (such as Discord) **NEVER** roll back XP awards, achievement unlocks, level progression, or challenge completions.

2. **Credential Security & Encryption at Rest**:
   Bot tokens, OAuth credentials, and Webhook URLs are encrypted at rest using AES-256-GCM via `@gami/webhooks` encryption utilities. Secret values are redacted (`"[REDACTED]"`) in all API responses, audit logs, worker logs, and dashboard views. Safe metadata (`guildId`, `channelId`, `guildName`, `channelName`) is exposed for status reporting.

3. **Multi-Integration Per Project**:
   Projects can configure multiple integration channels (including multiple Discord channels or servers). Each integration maintains independent configuration, notification preferences, status, and delivery history.

4. **Idempotency & Replay**:
   - `integration_deliveries` has a unique database index on `(integration_id, notification_id)` ensuring a canonical notification generates at most one delivery intent per integration.
   - Replaying a delivery resets `status = 'pending'`, `attempts = 0`, `availableAt = now()`, and records `replayedAt = now()`. Replay does **not** insert duplicate rows or trigger duplicate gamification rewards.

5. **Worker Outbox Dispatcher**:
   The background worker (`apps/worker/src/integration-dispatcher.ts`) queries pending deliveries using `SELECT ... FOR UPDATE SKIP LOCKED` for concurrent worker safety, supporting retries with exponential backoff and 5-minute stale processing recovery.

6. **Platform Admin Global Override**:
   Platform administrators can globally enable or disable integrations via Server Configuration (`integrations.enabled`, `integrations.discord.enabled`). Global overrides halt delivery processing immediately without destroying project configuration.
