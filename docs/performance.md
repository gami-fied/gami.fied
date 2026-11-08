# Performance

What has been measured, how to measure it on your own hardware, and what has not been measured yet.

## What is published here, and what is not

Two kinds of numbers matter, and only one is published:

- **Query timings** are measured by PostgreSQL itself (`EXPLAIN ANALYZE`), so network distance does not count. They are below, with the script that produced them.
- **End-to-end throughput** (events per second through the API and worker) depends on your CPU, your database and the distance between them. The author's development setup has a database 170 to 300 ms away, which makes any throughput figure from it describe the network, not the software. **No throughput figure is published.** Run `scripts/load-test.mjs` on hardware like yours and treat that result as the capacity number for your deployment.

## Leaderboard queries

Measured on a synthetic project with 100,000 end users (2% deactivated), 100,000 balance rows and 500,000 ledger rows, as PostgreSQL execution time.

| Query | Before | Now |
| :--- | ---: | ---: |
| All-time, top 20 | about 185 ms | about 1.5 ms |
| All-time, total ranked users | included in each page | about 30 ms |
| All-time, one user's rank | 160 to 300 ms | about 32 ms |
| Weekly, top 20 | about 310 ms | unchanged |

The all-time board now reads the first rows of an index on `(project_id, total_xp DESC, user_id)` instead of ranking every user. The cost of the total and of a single user's rank still grows linearly, at roughly 30 ms per 100,000 users. Searching a board, and daily, weekly or monthly boards, still rank every user who earned XP in the period. Redis sorted sets would make those constant, and are not used: they add a second source of truth to keep in step with the ledger. If your boards are much larger than 100,000 users, that is the next step.

Reproduce it with the test database only (the script refuses any other name, seeds one project and deletes it afterwards):

```bash
DATABASE_URL_TEST=postgresql://user:password@host:5432/gamified_test node scripts/benchmark-leaderboards.mjs 100000
```

## Other changes that reduce load

| Area | Change |
| :--- | :--- |
| API key authentication | One joined query instead of three, and `last_used_at` is written at most once a minute per key. Lookups are not cached, so a revoked key stops working at once. |
| Level distribution | Counted in SQL instead of loading every user into Node. |
| Challenge summary | Counted in SQL instead of loading every progress row into Node. |
| Worker | Handles several events at once (`WORKER_CONCURRENCY`, default 4). |
| Database | Connection pool size is set with `DATABASE_POOL_MAX`. |
| Shutdown | The worker finishes running jobs before it exits. |

## Running a load test

Use a stack you can fill with synthetic users, not production. Create a project, an API key, and a rule that awards XP for an event named `load_test`. Then:

```bash
API_URL=http://localhost:3001 API_KEY=gami_live_REPLACE_ME node scripts/load-test.mjs
```

`EVENTS` (default 2000), `CONCURRENCY` (25), `USERS` (500) and `EVENT_NAME` change the shape. The script prints:

- accepted events per second and accept latency (p50, p95, p99)
- how long after the last accepted event the first user's XP appeared, which approximates the worker's backlog
- leaderboard latency over 50 requests

Run it from a machine near the API, and watch `gami_outbox_oldest_pending_seconds` (see [Operations](./operations.md)) while it runs. If the worker falls behind, add replicas before raising `WORKER_CONCURRENCY`.

## Not done yet

- A published end-to-end load test on reference hardware.
- Fair scheduling between projects. One project that sends a burst is processed in arrival order alongside the rest.
- Partitioning `events` and `xp_ledger` by month, and rollup tables for analytics. Large installations will want these.
- A single event-processing path. The worker's processor and the outbox poller both dispatch notifications and rewards, which repeats some work.
- Time-ordered IDs in place of the current timestamp-based ones.
