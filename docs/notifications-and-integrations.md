# Notifications, webhooks and integrations

Gami.Fied can tell users and your own systems when something happens. All delivery runs in the worker from outbox tables, so a slow service never holds up events.

---

## 1. In-app notifications

Notifications are stored in the `notifications` table, with a type, title, message and data.

The types are `xp_awarded`, `achievement_unlocked`, `level_up` and `challenge_completed`. Preferences are kept per user, type and channel in `notification_preferences`.

Users can read their own with `GET /v1/me/notifications` and an end-user token.

---

## 2. Email

- Emails wait in `email_notification_outbox`.
- The worker sends them with Nodemailer, using the settings saved under **Platform Admin > Server Settings**, or the `SMTP_*` variables.
- Failed sends are retried with a growing delay. The error is saved in `last_error`.
- Security emails, such as verification codes, are always sent, whatever the user's preferences.

---

## 3. Webhooks

Webhooks tell your own systems when something happens. The events are:

| Event | When |
| :--- | :--- |
| `xp.awarded` | A user gains XP |
| `achievement.unlocked` | A user earns an achievement |
| `level.up` | A user reaches a new level |
| `challenge.completed` | A user finishes a challenge |
| `user.created` | A user is created |
| `user.deactivated` | A user is deactivated |

Deliveries wait in `webhook_outbox`. An endpoint must return a 2xx status within the timeout, which is 10 seconds by default. Failures are retried with a growing delay, and you can see and replay deliveries in the dashboard.

After 20 deliveries in a row use up all their retries, the endpoint is disabled and its owners are emailed if SMTP is set up. Turning it back on resets the count.

### Verifying a delivery

Each delivery includes these headers:

| Header | Purpose |
| :--- | :--- |
| `X-Gami-Timestamp` | When it was sent, in seconds |
| `X-Gami-Signature-V2` | Signature over the timestamp and the body |
| `X-Gami-Event-Id` | The event's ID, for ignoring repeats |
| `X-Gami-Event-Type` | The event, such as `level.up` |
| `X-Gami-Delivery-Id` | This delivery's ID |

Use `verifyWebhook` from the SDK. It checks the signature and rejects anything older than 5 minutes, so a captured delivery can't be replayed.

```ts
import { verifyWebhook } from '@gami.fied/sdk';

// rawBody is the body exactly as received, before JSON parsing.
export function isValidDelivery(rawBody: string, headers: Record<string, string>) {
  return verifyWebhook({
    rawBody,
    secret: process.env.GAMI_WEBHOOK_SECRET!,
    timestamp: headers['x-gami-timestamp']!,
    signature: headers['x-gami-signature-v2']!,
  });
}
```

When you rotate a secret, deliveries are signed with both the new and old secrets for 24 hours, so you can switch without missing any.

Webhook addresses are checked when saved and when connecting, so they can't reach private or loopback addresses.

---

## 4. Discord

The Discord integration posts to a channel through a Discord webhook.

- Choose which events are posted, for example level ups and achievements but not every XP award.
- Customise the title, colour, thumbnail and fields of the embed for each event.
