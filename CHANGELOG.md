# Changelog

All notable changes to Gami.Fied are recorded here. Versions follow
[Semantic Versioning](https://semver.org), and the public API is the `/v1` routes described in
[`docs/openapi.json`](docs/openapi.json).

## [Unreleased]

### Added

- Platform administrators can turn features on and off for the whole instance or one organization. Base features stay on, dependencies are followed both ways with a confirmation that lists what else changes, and the API, player routes, worker and dashboard all respect it. See `docs/platform-administration-features.md`.
- Organization rules with instance defaults: project and member limits, allowed email domains, API key lifetimes, API address allowlists, event rate limits and required player-token sites. Administrators can also change member roles, remove members, revoke every API key and sign everyone out.
- Velocity flags that mark people earning or sending events unusually fast, with optional automatic hiding and a review queue.
- Store rewards that generate a unique coupon code per purchase, and notifications three days before points expire.

- Segments, and leaderboards narrowed to a segment, to a player's friends, or to people who share the player's country or any other attribute, plus team and country boards ranked by total or average XP.
- Leagues: tiers of small groups that compete each week or day, with promotion and relegation, a Leagues page, and `gami.me.leagues()`.
- Friends, kudos, an activity feed, signed share-card images for achievements, and invite codes with rewards for both sides and a `referral.completed` webhook.
- Connectors for Segment, RudderStack, Stripe and GitHub, with signature checks and idempotent delivery.
- Staging and development projects with `gami_test_` keys, and promotion of a project's design to production with references fixed and rule history kept.
- Expression conditions in rules, using a safe subset of JSONLogic.
- Plugins: rule actions of your own, loaded from `GAMI_PLUGINS`. See `docs/connectors-environments-and-plugins.md`.

- Currencies, wallets and a reward store: points that can expire and be spent, rewards with stock, limits and code pools, purchases that cannot oversell, fulfilment and refunds, and `reward.redeemed` and `reward.cancelled` webhooks. Use `gami.store`, `gami.me.store()` and `gami.me.redeem()`, the `award_currency` rule action, and the Store page. See `docs/economy-and-store.md`.
- Boosts, XP limits and cooldowns, a blocked-XP log, and hiding people from rankings.
- Rule backtests over past events, drafts, publishing, history and rollback.

- `GET /metrics` serves Prometheus metrics for the database, Redis, worker, delivery queues and HTTP traffic. Set `METRICS_BEARER_TOKEN`, or sign in as a platform admin. Sample alert rules are in `deploy/prometheus`.
- Structured JSON logging with `LOG_LEVEL` and `LOG_FORMAT`, and event, project and rule IDs on worker log lines.
- `WORKER_CONCURRENCY`, `DATABASE_POOL_MAX`, `OUTBOX_STEP_TIMEOUT_MS` and `SMTP_TIMEOUT_MS` settings.
- `docs/operations.md` with monitoring, tuning and a runbook, and `docs/performance.md` with measurements.
- `docs/permissions.md`, generated from the registered routes, with a test that fails when it drifts.
- `scripts/load-test.mjs` and `scripts/benchmark-leaderboards.mjs`.

- Streaks: daily or weekly, counted in each user's own time zone, with automatic freezes, live reads, and a history. Read them with `gami.streaks`, `GET /v1/streaks` and `GET /v1/users/:userId/streaks`. See `docs/gamification-mechanics.md`.

- Challenges can be steps done in order, can count only events that meet conditions, and can repeat every day or week.
- Rules can compare a total over past events, such as spending this month, and fire once when it is reached.
- Achievements can earn themselves from a count, total, unique values or a streak, with tiers, bonus XP and secret badges.
- Live updates: `GET /v1/me/stream` pushes notifications and XP to players, and the dashboard refreshes as things happen.
- `@gami.fied/react`: a provider, hooks and components for levels, badges, streaks, leaderboards, challenges, notifications and toasts, and `GET /v1/me/leaderboard`.
- Campaigns: streak reminders, weekly recaps and win-back emails with editable templates and timing.
- Integrations for Slack, Microsoft Teams and any HTTPS webhook, and push notifications through Firebase and Apple, with `POST /v1/me/devices`.
- A profile page for each user with their XP ledger, streaks, achievements and challenges.

### Changed

- The all-time leaderboard reads from an index, so a page of 20 takes about 1.5 ms instead of about 185 ms at 100,000 users.
- API key checks use one query, and `last_used_at` is written at most once a minute.
- Level distribution and challenge summaries are counted in SQL.
- Analytics CSV exports of users, events, XP and achievements are streamed in batches instead of being limited to 5,000 rows in memory.
- The worker handles several events at once, and on shutdown waits for running jobs and the current poll.

## [1.0.0] - 2026-11-06

The first public release of Gami.Fied Community Edition: a self-hosted engine that turns events from your app into XP, levels, achievements, challenges and leaderboards.

### Run it

```bash
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.0.0/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.0.0/env.example
cp env.example .env
```

Fill in `.env`, then run `docker compose up -d`. Images are published for `linux/amd64` and `linux/arm64`.

### What's included

**Engine**

- Events with duplicate protection, sent one at a time or in batches of up to 100.
- A rules engine with conditions, previews, and a trace showing why a rule fired.
- XP history, levels, achievements, challenges, and all-time, daily, weekly and monthly leaderboards.
- In-app and email notifications, signed webhooks with retries and replay, and Discord integration.

**Developers**

- A stable `/v1` API. The API key identifies the project, and any endpoint with a user in its path accepts your own user ID.
- API keys with scopes, expiry and rotation.
- Short-lived end-user tokens for safe use in browsers, with the `/v1/me` endpoints.
- `@gami.fied/sdk` 1.0.0 for TypeScript, MIT licensed so it works in closed-source apps. The server stays AGPL-3.0.
- A full API reference in the dashboard, with every parameter, body, response and error, and samples in cURL, JavaScript and Python. Tests check every documented example against the real API.

**Dashboard**

- Clear navigation, an Overview of what's happening, search with Ctrl K, and a quick start from nothing to a user earning XP.
- Owner, admin and member roles, with project-level access and audit logs.
- Analytics with CSV exports, plus delivery health for each project.
- Dark and light themes, reduced motion support, and layouts for phones, tablets and wide screens.

**Self-hosting**

- A platform admin area for organizations, security, sessions, storage, backups and server settings.
- Organization data export and import, retention settings, and user erasure for privacy requests.
- Prebuilt Docker images, and a smoke test in CI that runs the real stack.

### Changed since 1.0.0-rc.2

- Pages load faster: Overview makes 5 API calls instead of 12, and moving between pages no longer reloads everything.
- Plain members no longer see end-user email addresses, in the dashboard, the API or CSV exports.
- Sidebar items are grouped, and Members, Invitations and Data moved under **Team**.
- All pages share one header, one focus style, and shared checkboxes, dropdowns and dialogs.
- `GET /api/projects/:projectId/users` accepts a `sort` of `newest`, `oldest` or `name`.

### Security

- Upgraded Next.js to 16.4, Better Auth to 1.7, Fastify to 5.12, Nodemailer to 10 and Zod to 4, along with their dependencies. This fixes every known advisory at release, including critical ones in Next.js and Better Auth, and an authentication bypass in Fastify.
- Removed the unused Better Auth organization plugin, so its `/api/auth/organization/*` routes no longer exist. Organization features use their own routes, which enforce your permission rules.

### Upgrading from a release candidate

Update `GAMI_VERSION` to `1.0.0` and restart. There are no database migrations or new settings.

Optional: to skip a hop through the dashboard, send `/api/*` and `/v1/*` straight to the API at your reverse proxy. See `Caddyfile.example`.

### Known limits

- Leaderboards and some summaries are calculated from the database on each read, and no load test has been published yet. Large installs should test first.
- Routes under `/api/projects` serve the dashboard and can change without notice. Build on `/v1`.

## [1.0.0-rc.2] - 2026-11-05

Second release candidate. Added prebuilt Docker images, the release workflow, and the dashboard work above in its first form.

## [1.0.0-rc.1] - 2026-08-19

First release candidate.

[1.0.0]: https://github.com/gami-fied/gami.fied/compare/v1.0.0-rc.2...v1.0.0
[1.0.0-rc.2]: https://github.com/gami-fied/gami.fied/compare/v1.0.0-rc.1...v1.0.0-rc.2
[1.0.0-rc.1]: https://github.com/gami-fied/gami.fied/releases/tag/v1.0.0-rc.1
