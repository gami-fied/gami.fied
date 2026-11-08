# Operations

How to watch a running Gami.Fied, tune it, and fix the usual problems. For setup, see [Deployment and production](./deployment-and-production.md). For measured capacity, see [Performance](./performance.md).

## Metrics

The API serves Prometheus metrics at `GET /metrics`. Set `METRICS_BEARER_TOKEN` to a long random value (`openssl rand -hex 32`) and have Prometheus send it as a bearer token. Without the variable, only a signed-in platform admin can read the endpoint.

The worker is a separate process with no HTTP port, so its state is read from the database and Redis. The metrics are therefore the same whichever API instance you scrape, and they keep working while the worker is down. Results are cached for 5 seconds, and each dependency has a 3 second limit so a slow Redis cannot hang a scrape.

| Metric | Meaning |
| :--- | :--- |
| `gami_database_up`, `gami_redis_up` | 1 when the API can reach them |
| `gami_worker_up` | 1 when a worker heartbeat arrived recently |
| `gami_worker_heartbeat_age_seconds` | Seconds since the last heartbeat |
| `gami_outbox_rows{queue,status}` | Rows pending, processing or failed in each delivery queue (`event`, `challenge_reward`, `notification`, `email`, `webhook`, `integration`) |
| `gami_outbox_oldest_pending_seconds{queue}` | How long the oldest pending row has waited |
| `gami_bullmq_jobs{state}` | Event jobs by BullMQ state |
| `gami_http_requests_total`, `gami_http_request_errors_total`, `gami_http_request_duration_seconds_sum` and `_count` | Per route, since that API process started |
| `gami_process_*` | API process uptime and memory |

HTTP counters live in each API process and reset on restart. Use `rate()` and `increase()`, which handle that.

Sample alert rules are in [`deploy/prometheus/alerts.yml`](../deploy/prometheus/alerts.yml), with a scrape config beside them. OpenTelemetry traces and a Grafana dashboard are not included yet.

## Logs

Every process writes one log line per event. In production the lines are JSON with `time`, `level`, `component` and `msg`, plus fields such as `eventId`, `projectId` and `ruleId` that tie a line to the work it belongs to. Locally you get plain text.

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `LOG_FORMAT` | `json` in production, `text` otherwise | Force `json` or `text` |

Passwords, tokens, keys and similar fields are replaced with `[REDACTED]` before they are written. To follow one event, search for its `eventId`. To follow one API request, search for the `X-Request-Id` the response returned (see [Request IDs](./request-ids.md)).

## Tuning

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `WORKER_CONCURRENCY` | `4` | Event jobs a worker handles at once |
| `DATABASE_POOL_MAX` | `10` | Database connections each process opens |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | How often the worker looks for pending deliveries |
| `OUTBOX_STEP_TIMEOUT_MS` | `60000` | Longest one delivery step may run before the poll moves on |
| `SMTP_TIMEOUT_MS` | `15000` | Longest a mail server may take to connect or respond |

Keep `WORKER_CONCURRENCY` below `DATABASE_POOL_MAX`, and keep the sum of every process's pool below PostgreSQL's `max_connections`. If events arrive faster than they are processed, add worker replicas before raising concurrency: each replica adds a pool and a CPU.

On shutdown the worker stops taking jobs, waits up to 30 seconds for running ones and the current outbox poll to finish, then exits. Set the container stop timeout above 30 seconds so Docker does not kill it first.

## Runbook

Start with `GET /ready`, then **Platform Health** in the dashboard (`/admin/system`).

### The API is down

1. Run `docker compose ps` and `docker compose logs --tail=100 api`.
2. A crash loop is usually a missing or invalid environment variable. The log names it.
3. Check `/health` (the process) and `/ready` (the database and Redis). A failing `/ready` points at the next section.

### The database or Redis is down

1. Check the service is running and reachable from the API container.
2. Look for connection limit errors. Lower `DATABASE_POOL_MAX` or raise PostgreSQL's `max_connections`.
3. Events already accepted are safe in PostgreSQL, and the worker catches up when the database returns. If Redis lost its data, the outbox poller queues the pending events again.

### The worker is stale

1. Run `docker compose logs --tail=100 worker`.
2. Restart it with `docker compose restart worker`. Pending work is kept in the database, so nothing is lost.
3. If it stops again, look for the line before the exit. A step timeout (`OUTBOX_STEP_TIMEOUT_MS`) names the step that hung.

### Work is piling up

`gami_outbox_oldest_pending_seconds` shows which queue is behind.

- **event**: the worker is saturated. Add replicas or raise `WORKER_CONCURRENCY`, and check database CPU.
- **email**: the mail server is slow or rejecting messages. Test it from the email settings.
- **webhook** or **integration**: a customer endpoint is slow. Delivery Health lists failing endpoints, and retries back off on their own.

### Failed deliveries

`gami_outbox_rows{status="failed"}` counts rows that used all their retries. Open **Delivery Health** to see the error, and replay them once the cause is fixed.

### The API is slow

1. Check `gami_database_up` and the database's own load first, because most requests are a few queries.
2. Large leaderboards: the all-time board is fast at any size, but search and daily, weekly or monthly boards read more data. See [Performance](./performance.md).
3. A database far from the API adds its round-trip time to every query. Keep them in the same region.
