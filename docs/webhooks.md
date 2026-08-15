# Gami Webhooks & External Event Delivery

The Gami Webhook System delivers real-time, signed HTTP POST notifications to registered customer server endpoints whenever gamification events occur in a project.

---

## 1. Supported Event Types

| Event Type | Trigger Description |
| :--- | :--- |
| `xp.awarded` | Triggered whenever XP is awarded to a user via rule execution or API. |
| `achievement.unlocked` | Triggered when a user unlocks a new achievement. |
| `level.up` | Triggered when a user crosses a level XP threshold and levels up. |
| `challenge.completed` | Triggered when a user satisfies all target progress requirements for a challenge. |
| `user.created` | Triggered when a new end-user profile is created or provisioned. |
| `user.deactivated` | Triggered when an end-user profile is soft-deactivated. |
| `webhook.test` | Triggered manually via Dashboard or API to verify endpoint connectivity. |

---

## 2. HTTP Request Headers

Every webhook HTTP POST request dispatched by Gami includes the following standard headers:

| Header | Example Value | Description |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Request payload format. |
| `X-Gami-Signature` | `sha256=a1b2c3...` | HMAC-SHA256 signature computed over the raw JSON payload using your secret. |
| `X-Gami-Event-Id` | `evt_1786654000_a1b2` | Unique ID of the underlying domain event. |
| `X-Gami-Event-Type` | `xp.awarded` | The event type name. |
| `X-Gami-Delivery-Id` | `who_1786654000_c3d4` | Unique outbox delivery ID (use as idempotency key for deduplication). |

---

## 3. Payload Format

```json
{
  "id": "evt_1786654000_a1b2",
  "type": "xp.awarded",
  "createdAt": "2026-08-15T20:00:00.000Z",
  "projectId": "prj_demo_123",
  "userId": "usr_987",
  "externalUserId": "customer_user_abc123",
  "data": {
    "amount": 100,
    "newBalance": 450,
    "reason": "Completed daily quest"
  }
}
```

---

## 4. HMAC Signature Verification

To verify that incoming webhook requests genuinely originated from Gami and were not tampered with in transit:

### Node.js / TypeScript Example

```typescript
import crypto from 'crypto';

export function verifyGamiWebhook(
  rawBody: string | Buffer,
  secret: string,
  signatureHeader: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
```

### Python Example

```python
import hmac
import hashlib

def verify_gami_webhook(raw_body: bytes, secret: str, signature_header: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    
    expected_digest = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    expected_header = f"sha256={expected_digest}"
    return hmac.compare_digest(expected_header, signature_header)
```

---

## 5. Retry Policy & Delivery Guarantees

- **Delivery Semantics**: At-least-once delivery guaranteed via durable PostgreSQL transactional outbox.
- **Request Timeout**: 10 seconds per HTTP POST delivery attempt.
- **Transient Errors**: HTTP status `408`, `429`, `5xx`, or network timeouts/connection resets trigger exponential backoff retries.
- **Backoff Delays**: 5s $\rightarrow$ 30s $\rightarrow$ 2m $\rightarrow$ 10m $\rightarrow$ 1h (up to **10 maximum attempts**).
- **Permanent Failures**: Non-retryable 4xx HTTP responses (`400`, `401`, `403`, `404`) mark the delivery as permanently failed.
- **Deduplication**: Use `X-Gami-Delivery-Id` to deduplicate incoming deliveries on your server.

---

## 6. Security & SSRF Rules

- **Protocols**: `http` and `https` allowed in development. `https` is strictly enforced in production.
- **Blocked Hostnames & IPs**: `localhost`, loopback IPs (`127.0.0.0/8`), private RFC1918 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and AWS/GCP cloud metadata IP (`169.254.169.254`) are blocked.
- **DNS Rebinding Shield**: Hostnames are resolved to IP addresses both during URL registration and immediately prior to dispatching HTTP requests.
- **Redirect Policy**: Redirects are explicitly disabled (`redirect: 'manual'`) to prevent SSRF bypasses.
