# Release checklist

Work through this for each release. Pushing a version tag starts the build, so finish the first two sections before tagging.

## 1. Before tagging

- [ ] `pnpm install --frozen-lockfile` works.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- [ ] `pnpm test` passes in full, with PostgreSQL and Redis running.
- [ ] `pnpm audit` reports no vulnerabilities.
- [ ] `pnpm docs:check` and `node scripts/check-bundle.mjs` pass.
- [ ] If `/v1` routes changed, `pnpm --filter @gami/api openapi:generate` has been run.

## 2. Version and changelog

- [ ] `version` is updated in the root `package.json` and in `packages/config/src/product.ts`.
- [ ] `CHANGELOG.md` has a section for the version. The release notes are taken from it.
- [ ] Any database migrations or new settings are explained under upgrading.
- [ ] If the SDK changed, its version and `packages/sdk/CHANGELOG.md` are updated.

## 3. Release

- [ ] The change is merged to `master`.
- [ ] The tag is pushed. See [Publishing a release](./deployment-and-production.md#publishing-a-release).
- [ ] The Release workflow passes. It runs the tests and boots the images before publishing anything.

## 4. After release

- [ ] The GitHub release has `docker-compose.yml`, `env.example` and the right notes.
- [ ] The images pull while signed out of GitHub.
- [ ] A fresh install from the release files works.
- [ ] If the SDK changed, it's published:

```powershell
pnpm --filter "@gami.fied/sdk" publish --access public
```
