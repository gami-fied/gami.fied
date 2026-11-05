# Production Deployment & Troubleshooting

This guide covers production deployment using Docker Compose, environment variable requirements, health check verification, observability metrics, and troubleshooting procedures.

---

## 1. Production Docker Compose Setup

Gami provides a production-ready `docker-compose.yml` file that orchestrates PostgreSQL, Redis, API, Worker, and Dashboard services with health checks and restart policies.

### Run Production Stack

```bash
cp .env.production.example .env
# Replace every placeholder in .env before starting
docker compose up -d
```

---

The stack refuses to start without `POSTGRES_PASSWORD` and `REDIS_PASSWORD`. Postgres and Redis are not published on the host, so reach them through the Compose network.

Set `TRUST_PROXY=true` only behind a reverse proxy that overwrites `X-Forwarded-*` headers. Without such a proxy, clients could forge their IP address.

To rotate `ENCRYPTION_MASTER_KEY`, set the new value and move the old one to `ENCRYPTION_MASTER_KEY_PREVIOUS`. Existing secrets keep decrypting, and you can remove the old key once they have all been saved again.

## 2. Production Environment Variable Checklist

| Environment Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection String | `postgresql://gami:secret@postgres:5432/gami` |
| `REDIS_URL` | Redis Connection String | `redis://default:secret@redis:6379` |
| `BETTER_AUTH_SECRET` | 32+ byte auth secret key | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Base API Endpoint URL | `https://api.gami.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | Base Dashboard Web URL | `https://app.gami.yourdomain.com` |
| `ENCRYPTION_MASTER_KEY`| 64-character hex master key | `openssl rand -hex 32` |
| `NODE_ENV` | Environment Flag | `production` |

---

## 3. Health Checks & Readiness Probes

Gami API provides explicit Kubernetes and Docker container health endpoints:

### Liveness Probe (`GET /health`)

Returns `200 OK` when the Fastify process is running.

```json
{
  "status": "ok",
  "timestamp": "2026-08-16T12:00:00.000Z"
}
```

### Readiness Probe (`GET /ready`)

Checks live connectivity to PostgreSQL database and Redis cache. Returns `200 OK` when fully healthy, or `503 Service Unavailable` if database/redis connections drop.

```json
{
  "status": "ready",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2026-08-16T12:00:00.000Z"
}
```

---

## 4. Observability Metrics (Prometheus Format)

Gami exports Prometheus metrics at `GET /metrics` (protected by Platform Admin authorization or `METRICS_BEARER_TOKEN`):

Metrics include:
- `http_requests_total`: Counter of total HTTP requests by method, route, and status code.
- `http_request_duration_seconds`: Histogram of API latency.
- `events_ingested_total`: Counter of total events processed.
- `webhook_deliveries_total`: Counter of webhook dispatches by status.

---

## 5. Production Smoke Testing

Run the automated production smoke test suite against a running environment to verify health, auth, event ingestion, and outbox processing:

```bash
pnpm --filter @gami/api test src/__tests__/production-smoke-test.test.ts
```

---

## 6. Troubleshooting & Recovery

### Database Connection Failure
- Verify `DATABASE_URL` format and password escaping.
- Run `pnpm --filter @gami/database migrate` to ensure schema migrations are up to date.

### Emails Not Delivering
- Check Platform Admin SMTP Settings (`/admin/smtp`).
- Verify `encryptedPassword` decryption in `@gami/webhooks`.
- Inspect `email_notification_outbox` table status (`status = 'failed'`, check `last_error` column).

### Webhooks Retrying / Failing
- Ensure target endpoint returns HTTP 2xx within configured timeout (default 5000ms).
- Check `webhook_deliveries` log table for HTTP response body and error message.

## Reverse proxy and TLS

Run the stack behind a proxy that terminates TLS. `Caddyfile.example` is a working starting point. Set `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL` to your public addresses, and `TRUST_PROXY=true`. Browsers can call the API from `NEXT_PUBLIC_APP_URL` and anything in `TRUSTED_ORIGINS`.

## Instance settings

Settings live in the admin API, under `PATCH /api/admin/config` with `category` and `payload`. A save replaces the whole category. Changes reach other processes within 30 seconds.

| Category | Settings |
| :--- | :--- |
| `security` | `requireEmailOtpVerification`, `maxSessionLifetimeHours`, `loginRateLimit`, `maxFailedLoginAttempts`, `lockoutDurationMinutes`, `passwordMinLength`, `requireNumbers`, `requireSpecialChars` |
| `registration` | `allowPublicRegistration`, `allowOrgCreation`, `allowApiKeyCreation`, `allowWebhookCreation`, `allowGlobalEmailNotifications` |
| `rate_limits` | `perIpLimit`, `perProjectLimit`, `windowMs` |
| `notifications` | `enabled`, `defaultEmailNotifications`, `maxDailyEmailsPerUser`, `retryAttempts` |
| `webhooks` | `enabled`, `maxWebhooksPerProject`, `defaultTimeoutMs`, `maxRetryAttempts` |
| `integrations` | `enabled`, `allowDiscordIntegration` |
| `retention` | See [Data retention](./data-retention.md) |

When `allowPublicRegistration` is off, the first account and invited emails can still sign up. When `allowOrgCreation` is off, only platform admins can create organizations.

Rate limits use the saved value, then `RATE_LIMIT_IP_MAX`, `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`, then defaults of 600 per IP and 1,000 per project each minute.

SMTP uses the settings saved in the admin UI, or the `SMTP_*` variables. Certificates are verified unless you set `SMTP_ALLOW_SELF_SIGNED=true`.

Organization imports accept up to 100 MB. Change this with `ORG_IMPORT_MAX_BYTES`.

## Installing from published images

Each release publishes `gami-api`, `gami-worker` and `gami-dashboard` to the GitHub Container Registry for `linux/amd64` and `linux/arm64`, so there is nothing to build.

1. From the [latest release](https://github.com/gami-fied/gami.fied/releases), download `docker-compose.yml` and `env.example`.
2. Rename `env.example` to `.env`, and fill in every secret. Each one needs a long random value, for example from `openssl rand -hex 32`.
3. Start it:

```bash
docker compose up -d
```

The dashboard is at `http://localhost:3000`. To upgrade, change `GAMI_VERSION` in `.env`, then run:

```bash
docker compose pull
docker compose up -d
```

The compose file from a release is pinned to that version. In a checkout, it uses `latest`, which only exists after the first stable release, so set `GAMI_VERSION` or build from source:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Images have no address built in. The browser only talks to the dashboard, which reaches the API through `API_URL`, so the same image works on any domain.

## Publishing a release

Push a version tag. CI runs first, including booting the images and sending a real event through them, and nothing is published unless that passes.

```bash
git tag v1.2.3
git push origin v1.2.3
```

A stable tag publishes `1.2.3`, `1.2`, `1` and `latest`. A pre-release such as `v1.2.3-rc.1` only publishes its exact version.
