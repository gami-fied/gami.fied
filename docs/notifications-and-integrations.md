# Notifications, webhooks and integrations

Gami.Fied can tell users and your own systems when something happens. All delivery runs in the worker from outbox tables, so a slow service never holds up events.

---

## In-app notifications

Notifications are stored in the `notifications` table, with a type, title, message and data.

The types are `xp_awarded`, `achievement_unlocked`, `level_up`, `challenge_completed`, `points_expiring` and `prize_won`. Preferences are kept per user, type and channel in `notification_preferences`.

### The player's inbox

A player reads their own notifications with an end-user token, and each one knows whether it has been read:

| Call | What it does |
| --- | --- |
| `GET /v1/me/notifications` | Newest first, with `read` and `readAt` on each, the total `unreadCount`, and `hasMore`. `?unread=true` gives unread ones only, `?limit=` up to 100, and `?before=` the `createdAt` of the last one you have, to page back |
| `GET /v1/me/notifications/unread-count` | Just the number, for a badge on a bell |
| `POST /v1/me/notifications/:id/read` | Marks one read |
| `POST /v1/me/notifications/read-all` | Marks them all read |

Marking a notification read works with a **read-only** token, because it changes nothing of value. A player can only see and mark their own. When one tab marks something read, the player's other tabs hear about it over the live stream.

```ts
const { data, unreadCount } = await gami.me.notifications({ limit: 20 });
await gami.me.markNotificationRead(data[0].id);
await gami.me.markAllNotificationsRead();
```

In React, `<NotificationInbox />` shows the count, the list and "Mark all read", and `useNotifications()` returns `unreadCount`, `markRead` and `markAllRead`. See [Translations](./translations.md) for notifications in a player's own language.

---

## Email

- Emails wait in `email_notification_outbox`.
- The worker sends them with Nodemailer, using the settings saved under **Platform Admin > Server Settings**, or the `SMTP_*` variables.
- Failed sends are retried with a growing delay. The error is saved in `last_error`.
- Security emails, such as verification codes, are always sent, whatever the user's preferences.

---

## Webhooks

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
| `box.opened` | A user opened a mystery box or spun a wheel, with what it gave |
| `goal.completed` | A shared goal reached its target, for everyone or for one team |
| `journey.completed` | A user finished the last step of a journey |
| `leaderboard.prize_paid` | A place on a daily, weekly or monthly board was paid its prize |
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

## Discord

The Discord integration posts to a channel through a Discord webhook.

- Choose which events are posted, for example level ups and achievements but not every XP award.
- Customise the title, colour, thumbnail and fields of the embed for each event.

---

## Slack, Microsoft Teams and any webhook

Connect them from **Integrations**. Each needs the address of an incoming webhook, which is stored encrypted and never shown again, and each sends the same four updates as Discord (XP, achievements, level-ups and finished challenges), which you can switch on and off per integration.

| Provider | What to paste | Notes |
| :--- | :--- | :--- |
| Slack | An Incoming Webhook URL from `hooks.slack.com` | Sent as a Block Kit message. Names and titles are escaped so a player can't mention `@everyone` |
| Microsoft Teams | A Workflows webhook URL (`*.logic.azure.com`, `*.webhook.office.com` or `*.powerplatform.com`) | Sent as an Adaptive Card |
| Webhook (any URL) | Any public HTTPS address | Sent as JSON. Add a signing secret and each request carries the same `X-Gami-Signature` headers as webhooks. Addresses on private networks are refused |

The address is checked when you save it, and again each time something is sent. Rate limits and server errors are retried, while a deleted or mistyped webhook is reported as a failure that retrying won't fix. The delivery log shows each attempt.

## Push notifications

Push sends a notification straight to a player's phone or browser. Connect **Android push (Firebase)**, **iPhone push (Apple)** or **Browser push (web)** from Integrations.

- **Firebase**: upload a service account key (Project settings, Service accounts, Generate new private key).
- **Apple**: give the team ID, key ID and bundle ID, and paste the `.p8` key. Turn on Sandbox for development builds.

Credentials are encrypted and never returned. Then your app registers each phone once per launch with the token the system gave it, using an end-user token:

```bash
curl -X POST https://api.example.com/v1/me/devices \
  -H "Authorization: Bearer geu_REPLACE_ME" -H "Content-Type: application/json" \
  -d '{ "token": "<APNs or FCM token>", "platform": "android" }'
```

`gami.me.registerDevice({ token, platform })` and `gami.me.unregisterDevice(token)` do the same from the SDK. A phone belongs to one player, so if someone else signs in on it, it moves to them. Call unregister when a player signs out. Phones that Apple or Google report as gone are forgotten automatically. A player with no registered phone simply gets no push, and nothing fails.

### Browsers

Browser push needs no account with anyone. Connect **Browser push (web)** with a contact email, which browser push services ask of every sender. A key pair is made for the project: the public key is shown, and the private key is stored encrypted and never returned.

1. Copy `push-worker.js` from `@gami.fied/sdk` to your site's root, for example as `/gami-push-worker.js`. It is the service worker that shows the notification.
2. From a click (browsers only ask for permission after one), with a token created with `access: "write"`:

```ts
const result = await gami.me.enableWebPush({ serviceWorker: '/gami-push-worker.js' });
if (!result.enabled) console.log(result.reason); // 'unsupported', 'denied' or 'not_set_up'
```

That asks the player for permission, subscribes the browser with the project's public key (`GET /v1/me/push/web-key`), and registers the subscription (`POST /v1/me/devices` with `platform: "web"`). `gami.me.disableWebPush()` undoes it, and is worth calling when a player signs out.

What to know:

- **Each message is encrypted for the one browser it goes to.** The push service that carries it cannot read it.
- **A subscription must point at a browser push service** (Google, Mozilla, Microsoft or Apple). Anything else is refused with `PUSH_ENDPOINT_NOT_ALLOWED`, because the server sends requests to that address. `WEB_PUSH_ALLOWED_HOSTS` adds hosts, comma separated.
- **Your site must be served over HTTPS**, and on iPhone and iPad the player must first add the site to their home screen. Those are the browsers' rules.
- **A browser that unsubscribes is forgotten** the next time a push to it fails.
- **Deleting the integration and making a new one makes a new key pair**, and browsers subscribed with the old key stop receiving. They need to subscribe again.
- To remove a phone or a browser, use `gami.me.unregisterDevice(token)`, which sends the token in the body. Browser addresses and many phone tokens are too long for the older `DELETE /v1/me/devices/:token`.
