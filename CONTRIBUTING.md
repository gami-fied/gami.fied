# Contributing to Gami.Fied

Thank you for helping. This page covers how to set up the project, what to check before opening a pull request, and how your work is licensed.

- **Questions and ideas:** open a [discussion](https://github.com/gami-fied/gami.fied/discussions).
- **Bugs:** open an [issue](https://github.com/gami-fied/gami.fied/issues/new/choose) with the bug form.
- **Security problems:** do not open an issue. Follow [SECURITY.md](./SECURITY.md).

For anything larger than a small fix, open an issue or a discussion first, so we can agree on the approach before you spend time on it.

## Set up

You need Node.js 22 or later, pnpm 11 or later, and Docker.

```bash
git clone https://github.com/gami-fied/gami.fied.git
cd gami.fied
pnpm install
cp .env.example .env
pnpm infra:up          # PostgreSQL on 5432 and Redis on 6379
pnpm db:migrate:dev
pnpm db:seed           # optional: a demo login and an API key
pnpm dev               # dashboard on 3000, API on 3001, and the worker
```

`pnpm infra:up` also creates the `gami_community_test` database the tests use. If your Postgres volume is older than that script, create it yourself:

```bash
docker compose -f docker-compose.dev.yml exec postgres createdb -U gami gami_community_test
```

## How the code is laid out

- `apps/api`: the HTTP API (Fastify). Routes for the dashboard are under `/api`, and the public API is under `/v1`.
- `apps/worker`: runs rules, streaks, challenges and deliveries from the queue.
- `apps/dashboard`: the Next.js dashboard.
- `apps/website`: the website and docs (Astro and Starlight).
- `packages/*`: shared code. `@gami.fied/sdk`, `@gami.fied/react` and `@gami.fied/elements` are published to npm. The `@gami/*` packages are internal.
- `docs/`: the guides, which the website also publishes.

[docs/architecture.md](./docs/architecture.md) explains how an event becomes XP, badges and notifications.

## Before you open a pull request

Run these from the repository root. CI runs the same ones.

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test        # needs PostgreSQL and Redis running
pnpm docs:check
```

Depending on what you changed, also:

- **A `/v1` route:** run `pnpm --filter @gami/api openapi:generate` and commit `docs/openapi.json`. The contract tests run every documented example against the real API, and every `/v1/me` route needs an SDK call.
- **Who can call a route:** add it to the feature and permission maps in `apps/api/src/authorization/`. Routes that are not mapped are refused. If the permissions page changes, regenerate it with `UPDATE_DOCS=1 pnpm --filter @gami/api exec vitest run permissions-doc`.
- **The database schema:** run `pnpm db:generate` and commit the new migration. Never edit a migration that has been released.
- **The dashboard:** run `pnpm --filter @gami/dashboard walk` against a running stack. It opens every page in both themes and at phone width, and fails on script errors, missing headings or accessibility problems.
- **The website:** run `pnpm --filter @gami/website build`, then `pnpm --filter @gami/website check:links`.
- **Anything a user would notice:** add a line under `## [Unreleased]` in [CHANGELOG.md](./CHANGELOG.md).

## Pull requests

- Keep each pull request to one change, and say why it is needed, not only what it does.
- Add a test for a bug fix that fails without the fix.
- Base your branch on the default branch, and keep it up to date by rebasing rather than merging.
- Write commit messages in the imperative, such as "Stop the inbox counting read messages".
- Write in plain words in the interface and the docs. Short sentences, no jargon a new user would not know.

A maintainer reviews every pull request. CI must pass before it can be merged.

## Licensing of contributions

The server, worker and dashboard are licensed under the [GNU AGPL v3.0](./LICENSE). The SDK, the React components and the web components (`packages/sdk`, `packages/react` and `packages/elements`) are licensed under the MIT License.

By opening a pull request, you agree that your contribution is licensed under the licence of the files it changes, and that you have the right to license it that way.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](./CODE_OF_CONDUCT.md).
