# Multi-Channel Notification Architecture

Gami provides an extensible, channel-aware notification delivery pipeline designed to deliver gamification achievements, level ups, challenge completions, and XP awards to end-users across multiple channels without modifying core gamification logic.

```
Gamification Event (e.g. event.ingested)
        ↓
Rules Engine Evaluation
        ↓
Canonical Notification Intent (notifications table)
        ↓
Notification Preferences Evaluation ((projectId, userId, channel, notificationType))
        ├── In-App Channel (enabled by default) → notification_outbox → In-App Center API
        └── Email Channel (requires user email) → email_notification_outbox → Worker Dispatcher → SMTP Provider
```

## Core Guarantees

1. **Single Canonical Notification Record**:
   - Every notification produces exactly one canonical record in `notifications`.
   - Channels are represented by dedicated outbox tables (`notification_outbox` for In-App, `email_notification_outbox` for Email).
   - Adding future channels (Discord, Slack, Push) requires adding a new outbox/dispatcher without altering canonical notification generation.

2. **Fault Isolation**:
   - Failed email outbox intent creation, missing recipient email addresses, or SMTP transport errors will **never** roll back XP awards, achievements, level progression, challenge completions, or canonical notifications.

3. **Multi-Worker Safety**:
   - `email_notification_outbox` uses `SELECT ... FOR UPDATE SKIP LOCKED` for atomic worker dispatch across concurrent background instances.
