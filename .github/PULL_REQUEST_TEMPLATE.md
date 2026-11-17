## What and why

<!-- What this changes, and why it is needed. Link the issue it closes, for example "Closes #123". -->

## How it was checked

<!-- The tests you added or ran, and anything you checked by hand. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` pass.
- [ ] A bug fix has a test that fails without it.
- [ ] A change to a `/v1` route regenerates `docs/openapi.json`.
- [ ] A schema change has a migration.
- [ ] A change people will notice has a line under `## [Unreleased]` in `CHANGELOG.md`.
- [ ] The docs are updated where they describe this.
