# Scripts

Repository utilities. Most are run through `pnpm` from the repository root.

| Script | Run with | Purpose |
| :--- | :--- | :--- |
| `backup-cli.ts` | `pnpm backup:create`, `backup:list`, `backup:verify --id <id>`, `backup:restore --id <id>` | Manage platform backups |
| `org-data-cli.ts` | `pnpm org:export --id <id>`, `pnpm org:import` | Export or import an organization |
| `check-docs.mjs` | `pnpm docs:check` | Type-checks SDK examples in the docs |
| `check-bundle.mjs` | `node scripts/check-bundle.mjs` | Fails if dashboard JavaScript passes its budget. Run it after `pnpm build` |
| `smoke-test.mjs` | `node scripts/smoke-test.mjs` | Sends a real event through a running stack. Set `DASHBOARD_URL` and `API_URL` if they aren't on localhost |
| `load-test.mjs` | `API_KEY=... node scripts/load-test.mjs` | Sends events to a running stack and reports accept latency, worker lag and leaderboard speed. See [Performance](../docs/performance.md) |
| `benchmark-leaderboards.mjs` | `DATABASE_URL_TEST=... node scripts/benchmark-leaderboards.mjs` | Times leaderboard queries on a synthetic project. Only runs against a database named `gamified_test` |

`postgres-init/` holds setup files that the Postgres container runs when it first starts.
