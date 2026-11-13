# Changelog

All notable changes to Gami.Fied are recorded here. Versions follow
[Semantic Versioning](https://semver.org), and the public API is the `/v1` routes described in
[`docs/openapi.json`](docs/openapi.json).

## [Unreleased]

### Fixed

- On hosts that also put the dashboard on a shared network, such as Dokploy and Coolify, the dashboard could reach another app's container called `api` instead of Gami.Fied's, and every API call failed. The compose files now give the API, Postgres and Redis names no other app uses (`gami-api`, `gami-postgres`, `gami-redis`), and connect through those.

## [1.2.0] - 2026-11-13

Gami.Fied now has a home at [gami.fied.cc](https://gami.fied.cc): a website with the docs, an API reference, an in-browser playground and a live demo you can start without signing up. The product gains design files and a demo mode for running that demo yourself. Everything is additive: `/v1` keeps working as it did, and nothing has to change in your app.

### Run it

```bash
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.2.0/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.2.0/env.example
cp env.example .env
```

Fill in `.env`, then run `docker compose up -d`. Images are published for `linux/amd64` and `linux/arm64`.

### Added

- Design files: download a project's design (currencies, achievements, levels, streaks, segments, leagues, rules, challenges, boosts, limits and store rewards) as JSON, preview what a file would add or change, and import all or part of it, from the API (`/api/projects/:projectId/design`) or the dashboard's **Promote changes** page. See [Connectors, environments and plugins](docs/connectors-environments-and-plugins.md#design-files).
- Demo mode for running a public live demo: `GAMI_DEMO_MODE=true` lets visitors start a seeded, locked-down workspace that deletes itself after a day, behind a Cloudflare Turnstile check and per-address limits. A demo instance sends no email. See [Live demo](docs/live-demo.md).
- One-click deploy files for Render, DigitalOcean App Platform and Coolify, described in [One-click deploys](docs/install/one-click.md). They have not been tried on those platforms yet.
- The website (`apps/website`): product pages, the docs with search and the docs for earlier releases, the API reference, the playground, a blog and this changelog.

### Fixed

- Rules built in the dashboard's visual editor with an "Award achievement" action can now be saved. The editor stored the achievement's id without its key, which the API needs, so saving failed.
- "Is in" and "is not in" conditions from the visual editor are saved as lists, as the API requires, instead of as one piece of text.
- The dashboard reaches the API when `API_URL` is given without `http://`.

### Changed

- The dashboard, docs and README use the Gami.Fied mark.
- The rules engine's plugin loader moved to `@gami/rules/node`, so the rest of the engine runs in a browser.

### Upgrading from 1.1.0

Set `GAMI_VERSION=1.2.0` and run `docker compose up -d`. One migration adds a column to `organizations` for demo workspaces; no data changes. The demo settings are all off unless you set `GAMI_DEMO_MODE`.

## [1.1.0] - 2026-11-08

A large feature release: streaks, a points economy and reward store, leagues and social play, inbound connectors, staging environments, plugins, and controls for platform administrators. Everything is additive: `/v1` keeps working as it did, and nothing has to change in your app.

### Run it

```bash
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.1.0/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/download/v1.1.0/env.example
cp env.example .env
```

Fill in `.env`, then run `docker compose up -d`. Images are published for `linux/amd64` and `linux/arm64`.

### Added

**Progression**

- Streaks: daily or weekly, counted in each user's own time zone, with automatic freezes, live reads and a history. Read them with `gami.streaks`, `GET /v1/streaks` and `GET /v1/users/:userId/streaks`.
- Achievements can earn themselves from a count, total, unique values or a streak, with tiers, bonus XP and secret badges.
- Challenges can be steps done in order, can count only events that meet conditions, and can repeat every day or week.
- Rules can compare a total over past events, such as spending this month, and fire once when it is reached.
- Expression conditions in rules, using a safe subset of JSONLogic.
- Rule drafts, publishing, history and rollback, and backtests that replay a rule over past events and estimate XP inflation before it goes live.
- Boosts such as double XP weekends, XP caps and cooldowns, a blocked-XP log, velocity flags with a review queue, and hiding people from rankings.

**Economy**

- Currencies and wallets: points that can expire, spent soonest-to-expire first, with a warning three days before they do.
- A reward store with stock, per-person limits, code pools and generated coupon codes. Purchases cannot oversell, and can be fulfilled or cancelled with a refund. New `reward.redeemed` and `reward.cancelled` webhooks, the `award_currency` rule action, `gami.store`, `gami.me.store()` and `gami.me.redeem()`.

**Competition and community**

- Segments, and leaderboards narrowed to a segment, to a player's friends, or to people who share the player's country or another attribute, plus team and country boards by total or average XP.
- Leagues: tiers of small groups that compete each week or day, with promotion and relegation.
- Friends, kudos, an activity feed, signed share-card images, and invite codes that reward both sides, with a `referral.completed` webhook.
- Live updates: `GET /v1/me/stream` pushes notifications and XP to players, and the dashboard refreshes as things happen.
- `@gami.fied/react`: a provider, hooks and components for levels, badges, streaks, leaderboards, challenges, notifications and toasts, and `GET /v1/me/leaderboard`.

**Messaging and integrations**

- Campaigns: streak reminders, weekly recaps and win-back emails with editable templates and timing.
- Integrations for Slack, Microsoft Teams and any HTTPS webhook, and push notifications through Firebase and Apple, with `POST /v1/me/devices`.
- Connectors that receive events from Segment, RudderStack, Stripe and GitHub, with signature checks and idempotent delivery.
- Plugins: rule actions of your own, loaded from `GAMI_PLUGINS`.

**Platform**

- Staging and development projects with `gami_test_` keys, and promotion of a project's design to production with references fixed and rule history kept.
- Platform administrators can turn features on and off for the whole instance or one organization. Base features stay on, and dependencies are followed both ways with a confirmation that lists what else changes.
- Organization rules with instance defaults: project and member limits, allowed email domains, API key lifetimes, API address allowlists, event rate limits and required player-token sites. Administrators can also change member roles, remove members, revoke every API key and sign everyone out.
- A profile page for each user with their XP ledger, wallet, streaks, achievements, challenges, leagues and friends.
- `GET /metrics` serves Prometheus metrics. Set `METRICS_BEARER_TOKEN`, or sign in as a platform admin. Sample alert rules are in `deploy/prometheus`.
- Structured JSON logging with `LOG_LEVEL` and `LOG_FORMAT`.

**Documentation**

- New guides: `docs/economy-and-store.md`, `docs/social-and-competition.md`, `docs/connectors-environments-and-plugins.md`, `docs/platform-administration-features.md`, `docs/operations.md` and `docs/performance.md`.
- `docs/permissions.md`, generated from the registered routes, with a test that fails when it drifts. The OpenAPI document covers every new `/v1` route.

### Changed

- The all-time leaderboard reads from an index, so a page of 20 takes about 1.5 ms instead of about 185 ms at 100,000 users.
- API key checks use one query, and `last_used_at` is written at most once a minute.
- Level distribution and challenge summaries are counted in SQL.
- Analytics CSV exports of users, events, XP and achievements are streamed in batches instead of being limited to 5,000 rows in memory.
- The worker handles several events at once, and on shutdown waits for running jobs and the current poll.

### Upgrading from 1.0.0

Set `GAMI_VERSION=1.1.0` and run `docker compose up -d`. The `migration` container applies the new database migrations before the API starts; they only add tables and columns, so no data changes.

New optional settings, all with safe defaults:

| Setting | Default | What it does |
| --- | --- | --- |
| `METRICS_BEARER_TOKEN` | unset | Lets a scraper read `GET /metrics` |
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, `json` in production | Log detail, and `json` or `text` lines |
| `WORKER_CONCURRENCY` | `4` | Events the worker handles at once |
| `DATABASE_POOL_MAX` | `10` | Database connections per process |
| `OUTBOX_STEP_TIMEOUT_MS`, `SMTP_TIMEOUT_MS` | built in | Time limits for delivery steps and email |
| `GAMI_PLUGINS` | unset | Plugin modules to load, for both the API and the worker |

Every feature is on after the upgrade. Turn any of them off in **Admin → Features**.

### Known limits

- Push notifications are tested against stand-ins for Apple and Google, not real accounts.
- `@gami.fied/react` is tested by rendering on the server, not yet in real browsers, and is not published to npm yet.
- Routes under `/api/projects` serve the dashboard and can change without notice. Build on `/v1`.

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

[1.2.0]: https://github.com/gami-fied/gami.fied/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gami-fied/gami.fied/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gami-fied/gami.fied/compare/v1.0.0-rc.2...v1.0.0
[1.0.0-rc.2]: https://github.com/gami-fied/gami.fied/compare/v1.0.0-rc.1...v1.0.0-rc.2
[1.0.0-rc.1]: https://github.com/gami-fied/gami.fied/releases/tag/v1.0.0-rc.1
