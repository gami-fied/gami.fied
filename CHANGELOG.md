# Changelog

All notable changes to Gami.Fied are recorded here. Versions follow
[Semantic Versioning](https://semver.org), and the public API is the `/v1` routes described in
[`docs/openapi.json`](docs/openapi.json).

## [Unreleased]

### Added

- **Mystery boxes and wheels.** Random rewards with weighted items, odds that players can read, an optional cost, a daily limit, and a guaranteed rare item after a run of bad luck. A new **Mystery boxes** page, `GET /v1/me/boxes` and `POST /v1/me/boxes/:boxKey/open`.
- **Season pass.** A track of tiers that players climb with the XP they earn during a season, with a free lane and a premium lane bought with a currency or given by your server.
- **Teams and shared goals.** Players join a team, teams are ranked by XP, and a goal sets one target for everyone or for each team. Everyone who contributed is paid when it is reached.
- **Cosmetics.** Titles, avatar frames and profile items that are unlocked by a badge, bought, won or given, and worn. `/v1/me` and leaderboard rows carry what a player wears.
- **Leaderboard prizes.** Pay a range of places on the daily, weekly or monthly board when the period ends. Until now a plain board paid nothing.
- **Journeys.** Chains of challenges where finishing one opens the next, with a prize for finishing the last.
- These six share one prize format (XP, a currency, a badge or a cosmetic), have their own feature switches, and come with SDK calls (`gami.me.*`, `gami.mechanics.*`), React components (`MysteryBox`, `SeasonPass`, `SharedGoals`, `TeamCard`, `JourneyPath`, `CosmeticLocker`) and four new webhook events (`box.opened`, `goal.completed`, `journey.completed`, `leaderboard.prize_paid`). See [the guide](docs/boxes-passes-teams-and-journeys.md).
- A `prize_won` notification type, sent for goal, leaderboard and journey prizes.
- **End a player's tokens early.** `POST /v1/users/:userId/tokens/revoke` (`gami.endUserTokens.revoke(userId)`) ends every token made for that player so far, for sign-out.
- **Limits per API key and per player.** One API key may make 600 requests a minute outside event ingestion (`RATE_LIMIT_KEY_MAX`), and one player's tokens 300 (`RATE_LIMIT_PLAYER_MAX`), so a single key or player cannot use up what an address is allowed.
- **`TRUST_PROXY` takes a number or addresses.** `TRUST_PROXY=1` trusts one proxy in front of the API, and `TRUST_PROXY=10.0.0.0/8` trusts only proxies in that range. `true` and `false` work as before.
- **Search does things.** Ctrl+K now offers actions such as Create rule, New API key and Invite teammate. `?` lists keyboard shortcuts, and `g` then a letter goes to a page.
- Tables for rules, challenges and API keys sort by column.
- **Player view.** Each user in the dashboard has a tab that shows what that player sees through the React components, using a short read-only token for them alone.
- Search finds rules, achievements and rewards by name. Filters, searches and page numbers on Leaderboard, Events, Team and Audit Logs are kept in the address, so a view can be refreshed or shared.
- **Website:** a light theme for the marketing pages, which follows the choice made in the docs; pages comparing Gami.Fied with Trophy and with Open Loyalty; and a caption track for the product tour.
- **Website:** a [component gallery](https://gami.fied.cc/components/), four use-case pages, a cost calculator on the pricing page, and a docs home page with links back to the rest of the site. On phones the home page diagram is stacked and readable, controls are large enough to tap, the comparison table keeps its first column in view, and the playground has tabs.
- A [threat model for player tokens](docs/player-token-security.md), and API docs for every `/v1/me` route, including the ones that change things.

### Changed

- `GET /v1/me` now includes `cosmetics`, each row of `GET /v1/me/leaderboard` includes `title` and `frameUrl`, and each row of `GET /v1/me/challenges` includes `locked`. Run the migration `0043_mechanics` when you upgrade; it only adds tables.
- **Player tokens are read-only unless you ask for more.** `POST /v1/end-user-tokens` takes `access: "read"` (the default) or `"write"`, and every `/v1/me` request that is not a `GET` now needs a write token; a read-only one gets `403 TOKEN_READ_ONLY`. **If your app lets players buy rewards, add friends, give kudos, use an invite code or register a device with a token, create that token with `access: "write"`** (`gami.endUserTokens.create({ userId, access: 'write' })`). Tokens were documented as read-only before, but were not.
- **Containers are locked down.** The API, worker and dashboard run with a read-only file system, no Linux capabilities and no way to gain privileges. Only the backups volume and `/tmp` can be written. If you added your own volume mounts or write files elsewhere, check them after upgrading.
- The release's `env.example` now names the release instead of `latest`, which had overridden the pinned version in the compose file. GitHub Actions are pinned to commits.
- Live streams for players check for missed updates every two minutes instead of every 15 seconds. Updates still arrive at once, because a stream is told when something changes. A dashboard stream closes within a minute of its user signing out or losing access.
- Batches of events, from `POST /v1/events/batch` and from connectors, are written in one transaction.
- **The dashboard menu is regrouped.** Pages are grouped as Progression, Economy, Players, Activity, Connect and Manage. Groups fold, and Connect and Manage start folded. Browser tabs now name the page and project, text is never smaller than 12 px, tabs work with the arrow keys, and there is a "Skip to content" link.
- **The API and dashboard ports are published on `127.0.0.1` only.** `docker-compose.yml` used to publish them on every network interface, which let people reach the API around a reverse proxy. **If you open the dashboard at `http://your-server:3000` without a proxy, set `BIND_ADDRESS=0.0.0.0` in `.env`,** or put a proxy in front. Platforms that route through the Docker network, such as Coolify and Dokploy, are not affected.
- **Opening an unsubscribe link now asks first.** The link shows a page with an Unsubscribe button, so mail scanners that open links no longer unsubscribe people. One-click unsubscribe from mail clients works as before.
- **Sign-in lockout is per address.** Failed sign-ins are counted for an email and an address together, so someone sending wrong passwords locks out their own address and not the account's owner. An account as a whole still locks after ten times the limit, or 50 failures, from all addresses.
- **Adding a friend now sends a request.** `gami.me.addFriend(code)` answers `{ friends: false, status: 'requested' }`, and the two players become friends when the other accepts with `gami.me.acceptFriend(code)`, or at once if they had already asked. Before, anyone who had a player's invite code became their friend and could see their feed. New: `gami.me.friendRequests()` and `gami.me.declineFriend(code)`. Linking players from your server with an API key is unchanged.

### Fixed

- Editing a challenge or an XP boost no longer moves its start and end times. The form showed them in UTC but saved them as local time, so every save shifted them by your time-zone offset.

- **Browsers on another site can call the player routes that change things.** CORS for `/v1/me` allowed only `GET`, so buying a reward or adding a friend from a customer's site failed before it was sent.
- Connectors now follow the same rules as `POST /v1/events`: a suspended organization, connectors switched off, or either event rate limit stops them taking events. Creating, changing, rotating and deleting a connector is written to the audit log.
- A `/v1` request was counted twice against the limit per address, and looked its API key up twice. It is now counted and checked once.
- Mail clients' one-click unsubscribe was refused with `415`, because the request is a form post. It is accepted now.
- The first-admin bootstrap secret is compared in constant time, and allows five attempts an hour per address and per account.
- Rate-limit counters set their expiry in the same step as the count, so a failure in between can no longer block an address for good.
- A player can no longer read another player's purchase, and its code, by sending that purchase's idempotency key. The request now gets `409 IDEMPOTENCY_KEY_IN_USE`.
- A player token stops working as soon as its player is deactivated or erased, instead of lasting until it expires.
- Tokens in a query string, such as the one a live stream uses, are no longer written to the request log.
- Share links are built from `BETTER_AUTH_URL` and live under `/v1/share/`, so they work behind a reverse proxy and cannot be pointed at another host. `/share/` links made earlier keep working.
- **Restoring a backup no longer loses data.** Backups held only the 22 tables that existed at 1.0, and a restore emptied every other table, including XP totals, streaks, wallets, the store, leagues and referrals. Backups now hold every table except sessions, short-lived codes and queued deliveries, and the list is built from the schema. **Make a new backup after upgrading.** A restore now refuses a backup made by an earlier version unless you pass `--partial`, and changes nothing if it fails part way. See [Backups](docs/backups.md).
- **Organization exports hold everything.** An export now includes streaks, wallets, the store, leagues, segments, referrals, campaigns, boosts and limits, and achievement progress, as format version 2. Version 1 files can still be imported.
- **Imports keep your own IDs and keys.** An import used to add `_imp_<n>` to each player's external ID and to achievement and challenge keys, so your app could not find imported players and imported rules awarded badges that did not exist. They are now kept exactly. Projects keep their name and slug unless the organization already has that slug.
- **Imports respect the organization's limits.** An import is counted against the project limit, is refused for demo organizations, and leaves out rules, challenges, levels and segments that the dashboard would not accept, listing each one. A file can no longer refer to rows outside itself.

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
