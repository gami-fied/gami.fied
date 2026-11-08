# Production Deployment & Troubleshooting

This guide covers production deployment using Docker Compose, environment variable requirements, health check verification, observability metrics, and troubleshooting procedures.

---

## 1. Production Docker Compose Setup

`docker-compose.yml` runs PostgreSQL, Redis, the API, the worker and the dashboard, with health checks and restart policies. A migration step runs before the API starts.

The quickest way in is [Installing from published images](#installing-from-published-images). From a checkout:

```bash
cp .env.production.example .env
# Replace every placeholder in .env before starting
docker compose up -d
```

The stack refuses to start without `POSTGRES_PASSWORD` and `REDIS_PASSWORD`. Postgres and Redis are not published on the host, so reach them through the Compose network.

Set `TRUST_PROXY=true` only behind a reverse proxy that overwrites `X-Forwarded-*` headers. Without such a proxy, clients could forge their IP address.

To rotate `ENCRYPTION_MASTER_KEY`, set the new value and move the old one to `ENCRYPTION_MASTER_KEY_PREVIOUS`. Existing secrets keep decrypting, and you can remove the old key once they have all been saved again.

## 2. Production Environment Variable Checklist

| Variable | Description | Example |
| :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | Password for the Compose database | `openssl rand -hex 32` |
| `REDIS_PASSWORD` | Password for the Compose Redis | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://gami:secret@postgres:5432/gami` |
| `REDIS_URL` | Redis connection string | `redis://default:secret@redis:6379` |
| `BETTER_AUTH_SECRET` | Signs sessions | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Public address of the API | `https://api.example.com` |
| `NEXT_PUBLIC_APP_URL` | Public address of the dashboard | `https://app.example.com` |
| `ENCRYPTION_MASTER_KEY` | Encrypts stored secrets and backups. Keep a copy | `openssl rand -hex 32` |
| `PLATFORM_BOOTSTRAP_SECRET` | Claims the first platform admin | `openssl rand -hex 32` |
| `GAMI_VERSION` | Image version to run | `1.0.0` |
| `TRUST_PROXY` | Set to `true` behind a reverse proxy | `true` |
| `TRUSTED_ORIGINS` | Extra sites allowed to call the API, comma separated | `https://www.example.com` |
| `NODE_ENV` | Environment | `production` |

`.env.production.example` lists every option, including the `SMTP_*` settings.

---

## 3. Health Checks & Readiness Probes

The API has two health endpoints for Docker, Kubernetes or uptime checks:

### Liveness Probe (`GET /health`)

Returns `200 OK` when the API process is running.

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

## 4. Monitoring

The API serves Prometheus metrics at `GET /metrics`, with sample alert rules in `deploy/prometheus`. Setup, logging, tuning and a runbook are in [Operations](./operations.md). Built-in views:

- **Platform Health** (`/admin/system`) shows the database, Redis, queues, workers and API traffic. `GET /api/admin/system` returns the same data for platform admins.
- **Delivery Health** (`/dashboard/system`) shows each project's queues and failures.
- `GET /ready` works well for uptime checks.

---

## 5. Production Smoke Testing

This sends a real event through a running stack, using its health checks, sign-up and event routes:

```bash
DASHBOARD_URL=http://localhost:3000 API_URL=http://localhost:3001 node scripts/smoke-test.mjs
```

---

## 6. Troubleshooting & Recovery

### Database Connection Failure
- Verify `DATABASE_URL` format and password escaping.
- Check that the `migration` container finished: `docker compose logs migration`. From a checkout, run `pnpm db:migrate`.

### Emails Not Delivering
- Check the email settings under **Platform Admin > Server Settings** (`/admin/settings`), and send a test email from there.
- If stored passwords stopped working, check that `ENCRYPTION_MASTER_KEY` hasn't changed.
- Look in the `email_notification_outbox` table for rows with `status = 'failed'`, and read `last_error`.

### Webhooks Retrying / Failing
- Make sure the endpoint returns a 2xx status within the timeout, which is 10 seconds by default.
- Open the webhook's delivery history in the dashboard to see the status and error. These are stored in `webhook_outbox`.
- After 20 deliveries in a row fail completely, the endpoint is disabled. Turn it back on from the Webhooks page.

## Reverse proxy and TLS

Run the stack behind a proxy that terminates TLS. `Caddyfile.example` is a working starting point. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your public addresses, and `TRUST_PROXY=true`. Browsers can call the API from `NEXT_PUBLIC_APP_URL` and anything in `TRUSTED_ORIGINS`.

The example sends `/api/*` and `/v1/*` straight to the API, which skips a hop through the dashboard. Without that route everything still works, as the dashboard forwards those paths itself.

`NEXT_PUBLIC_API_URL` only matters if you build the dashboard image yourself, because it's fixed at build time.

## Instance settings

Most settings are on the **Server Settings** and **Security** admin pages. They use `PATCH /api/admin/config` with a `category` and `payload`. A save changes the fields you send and keeps the rest, except `smtp`, which is replaced as a whole. Changes reach other processes within 30 seconds.

| Category | Settings |
| :--- | :--- |
| `smtp` | `host`, `port`, `user`, `password`, `fromEmail`, `fromName`, `secure` |
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

Check the [changelog](../CHANGELOG.md) for upgrade notes first.

The compose file from a release is pinned to that version. In a checkout, it uses `latest` unless you set `GAMI_VERSION`. To build from source instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Then [claim the first platform admin](./platform-administration.md#1-becoming-a-platform-admin).

Images have no address built in. The browser only talks to the dashboard, which reaches the API through `API_URL`, so the same image works on any domain. Compose sets `API_URL` for you.

## Publishing a release

Follow the [release checklist](./release-checklist.md), then push a version tag. CI runs first, including booting the images and sending a real event through them, and nothing is published unless that passes.

```bash
git tag -a v1.2.3 -m "Gami.Fied 1.2.3"
git push origin v1.2.3
```

A stable tag publishes `1.2.3`, `1.2`, `1` and `latest`. A pre-release such as `v1.2.3-rc.1` only publishes its exact version. The release notes come from that version's section in `CHANGELOG.md`.
