# Notifications, Webhooks & Integrations

Gami features a multi-channel notification engine, transactional email outbox dispatcher, signed webhooks, and Discord bot integration.

---

## 1. In-App Notifications

- **Canonical Notifications**: Stored in `notifications` table (`type`, `title`, `message`, `data`, `read`).
- **User Preferences**: Users can toggle notification channels in `notification_preferences` per event type (`xp_awarded`, `level_up`, `achievement_unlocked`, `challenge_completed`).

---

## 2. Transactional Email & Outbox Dispatcher

- **Outbox Architecture**: Email dispatches are staged in `email_notification_outbox` (`status: 'pending'`).
- **Background Worker**: `@gami/worker` polls pending outbox rows, constructs HTML/text emails via Nodemailer, and dispatches them asynchronously.
- **Retry Backoff**: Failed dispatches update `attempts` count and apply exponential backoff scheduling.

---

## 3. Webhooks & HMAC Signatures

Webhooks allow external systems to react to real-time Gami events (`user.level_up`, `achievement.unlocked`, `challenge.completed`).

### Webhook Security & Signatures

Every webhook HTTP POST request contains a cryptographic signature header:

```http
x-gami-signature: t=1786885000,v1=9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a
```

### Signature Verification Code (Node.js)

```typescript
import crypto from 'crypto';

function verifyGamiWebhook(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const timestamp = parts['t'];
  const expectedSig = parts['v1'];

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedSig));
}
```

---

## 4. Discord Bot Integration

Gami integrates natively with Discord webhooks to post rich embedded notifications into designated Discord channels.

- **Custom Embed Templates**: Supports customizable titles, colors, thumbnails, and field layouts per event.
- **Delivery Controls**: Toggle specific events to post to Discord (e.g. broadcast `level_up` and `achievement_unlocked` while muting `xp_awarded`).
