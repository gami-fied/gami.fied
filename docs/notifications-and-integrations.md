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
| `reward.redeemed` | A user buys a reward in the store. Use it to ship the item or send the code |
| `reward.cancelled` | A purchase is cancelled and the points are refunded |
| `referral.completed` | An invited friend qualified and the invite was rewarded |
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

---

## 5. Slack, Microsoft Teams and any webhook

Connect them from **Integrations**. Each needs the address of an incoming webhook, which is stored encrypted and never shown again, and each sends the same four updates as Discord (XP, achievements, level-ups and finished challenges), which you can switch on and off per integration.

| Provider | What to paste | Notes |
| :--- | :--- | :--- |
| Slack | An Incoming Webhook URL from `hooks.slack.com` | Sent as a Block Kit message. Names and titles are escaped so a player can't mention `@everyone` |
| Microsoft Teams | A Workflows webhook URL (`*.logic.azure.com`, `*.webhook.office.com` or `*.powerplatform.com`) | Sent as an Adaptive Card |
| Webhook (any URL) | Any public HTTPS address | Sent as JSON. Add a signing secret and each request carries the same `X-Gami-Signature` headers as webhooks. Addresses on private networks are refused |

The address is checked when you save it, and again each time something is sent. Rate limits and server errors are retried, while a deleted or mistyped webhook is reported as a failure that retrying won't fix. The delivery log shows each attempt.

## 6. Push notifications

Push sends a notification straight to a player's phone. Connect **Android push (Firebase)** or **iPhone push (Apple)** from Integrations.

- **Firebase**: upload a service account key (Project settings, Service accounts, Generate new private key).
- **Apple**: give the team ID, key ID and bundle ID, and paste the `.p8` key. Turn on Sandbox for development builds.

Credentials are encrypted and never returned. Then your app registers each phone once per launch with the token the system gave it, using an end-user token:

```bash
curl -X POST https://api.example.com/v1/me/devices \
  -H "Authorization: Bearer geu_REPLACE_ME" -H "Content-Type: application/json" \
  -d '{ "token": "<APNs or FCM token>", "platform": "android" }'
```

`gami.me.registerDevice({ token, platform })` and `gami.me.unregisterDevice(token)` do the same from the SDK. A phone belongs to one player, so if someone else signs in on it, it moves to them. Call unregister when a player signs out. Phones that Apple or Google report as gone are forgotten automatically. A player with no registered phone simply gets no push, and nothing fails.
