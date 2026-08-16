# Email Notification Templates & Delivery

Gami features centralized, deterministic email template rendering with dark HUD branding and plain-text fallbacks.

## Email Templates

Centralized templates rendered by `renderEmailTemplate(type, data)`:

1. **`xp_awarded`**:
   - Subject: `You earned {amount} XP!`
   - HTML: Dark HUD badge `+100 XP AWARDED` with reason description.
   - Text: Plain-text fallback version.

2. **`achievement_unlocked`**:
   - Subject: `You unlocked {name}!`
   - HTML: Badge `🏆 ACHIEVEMENT UNLOCKED` with title and description.

3. **`level_up`**:
   - Subject: `You reached Level {newLevel}!`
   - HTML: Badge `🚀 LEVEL UP` with level title.

4. **`challenge_completed`**:
   - Subject: `Challenge completed!`
   - HTML: Badge `🎯 CHALLENGE COMPLETED` with challenge title.

## Email Outbox & Delivery Retry Behavior

The background worker runs `dispatchPendingEmailNotifications()` periodically:

- **Backoff Schedule**: Bounded exponential backoff (5s, 30s, 2m, 10m, 1h).
- **Max Attempts**: 10 attempts. If delivery fails 10 times, outbox status transitions to `'failed'`.
- **Stale Processing Recovery**: Records stuck in `'processing'` status $> 5$ minutes are automatically reclaimed back to `'pending'`.
