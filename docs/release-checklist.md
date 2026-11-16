# Release checklist

Work through this for each release. Pushing a version tag starts the build, so finish the first two sections before tagging.

## Before tagging

- [ ] `pnpm install --frozen-lockfile` works.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- [ ] `pnpm test` passes in full, with PostgreSQL and Redis running.
- [ ] `pnpm audit` reports no vulnerabilities.
- [ ] `pnpm docs:check` and `node scripts/check-bundle.mjs` pass.
- [ ] If `/v1` routes changed, `pnpm --filter @gami/api openapi:generate` has been run.

## Version and changelog

- [ ] `version` is updated in the root `package.json` and in `packages/config/src/product.ts`.
- [ ] `CHANGELOG.md` has a section for the version. The release notes are taken from it.
- [ ] Any database migrations or new settings are explained under upgrading.
- [ ] If the SDK changed, its version and `packages/sdk/CHANGELOG.md` are updated. `@gami.fied/react` and `@gami.fied/elements` take the same version.

## Release

- [ ] The change is merged to `master`.
- [ ] The tag is pushed. See [Publishing a release](./deployment-and-production.md#publishing-a-release).
- [ ] The Release workflow passes. It runs the tests and boots the images before publishing anything.

## After release

- [ ] The GitHub release has `docker-compose.yml`, `env.example` and the right notes.
- [ ] The images pull while signed out of GitHub.
- [ ] A fresh install from the release files works.
- [ ] If the SDK, the React components or the web components changed, they are published, in this order, because each depends on the one before:

```powershell
pnpm --filter "@gami.fied/sdk" publish --access public
pnpm --filter "@gami.fied/react" publish --access public
pnpm --filter "@gami.fied/elements" publish --access public
```

Each one builds and tests itself first. `pnpm publish` replaces `workspace:*` with the real version, which `npm publish` does not, so use pnpm.
