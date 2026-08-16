# Production Deployment & Troubleshooting

This guide covers production deployment using Docker Compose, environment variable requirements, health check verification, observability metrics, and troubleshooting procedures.

---

## 1. Production Docker Compose Setup

Gami provides a production-ready `docker-compose.production.yml` file that orchestrates PostgreSQL, Redis, API, Worker, and Dashboard services with health checks and restart policies.

### Run Production Stack

```bash
docker compose -f docker-compose.production.yml up -d --build
```

---

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
