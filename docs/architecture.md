# Architecture and security model

Gami.Fied has three processes that share Postgres and Redis.

| Process | Role |
| :--- | :--- |
| API (`apps/api`) | Fastify server for the public API, the dashboard API, authentication and admin routes. |
| Worker (`apps/worker`) | Runs rules, grants rewards, sends webhooks and email, and prunes old data. |
| Dashboard (`apps/dashboard`) | Next.js app that talks to the API through its own proxy routes. |

## How an event flows

1. `POST /v1/events` saves the event and an `event_outbox` row in one transaction, then returns 202.
2. The worker publishes outbox rows to a BullMQ queue.
3. The worker runs each enabled rule whose trigger matches the event type, then updates challenge progress.
4. XP and achievements go through `@gami/rewards`, which writes the ledger, balance, notifications and webhooks in one transaction.
5. Worker loops deliver the webhooks, emails and integration messages from their own outboxes.

Writing work to an outbox in the same transaction as the data means a crash can delay work but not lose it. Retries are safe because each reward has a unique key.

## Tenancy

An organization owns projects, and a project owns all gamification data. Project routes go through `requireProjectAccess`, and foreign keys tie user data to its project at the database level.

## Who can do what

- **API keys** belong to one project and only do what their scopes allow. New keys default to `events:write`. Any route not in the central permission map is refused.
- **Signed-in users** get access from their organization role (`owner`, `admin` or `member`).
- **Platform admins** manage the instance through `/api/admin/*`, which API keys can never reach.

API key management, member management and project changes always need a signed-in user.

## Protecting secrets

| Secret | How it is stored |
| :--- | :--- |
| Passwords | Hashed by Better Auth |
| API keys | SHA-256 hash only |
| Webhook secrets, SMTP password | AES-256-GCM with `ENCRYPTION_MASTER_KEY` |
| Backups | AES-256-GCM with `ENCRYPTION_MASTER_KEY` by default |
| OTP codes | HMAC with the auth secret |

Production startup fails if a secret is missing, a known placeholder, or under 32 characters.

## Known limits

- Leaderboards and some summaries are calculated from PostgreSQL on each read, and no load test has been published yet.
- Backups are JSON files built in the API process, so they use memory in proportion to the data, and they stay on local disk. See [Backups](./backups.md).
- The project has had no independent security audit. See [Security status](./security-audit.md).
