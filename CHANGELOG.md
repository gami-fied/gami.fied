# Changelog

All notable changes to Gami.Fied are recorded here. Versions follow
[Semantic Versioning](https://semver.org), and the public API is the `/v1` routes described in
[`docs/openapi.json`](docs/openapi.json).

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
- `@gami.fied/sdk` 1.0.0 for TypeScript.
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
