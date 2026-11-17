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

- [ ] `pnpm release:version 1.4.0` (with the new version) sets it everywhere: the root and the three npm packages, `packages/config/src/product.ts`, the OpenAPI document, the docs examples and the supported line in `SECURITY.md`. CI fails if any of them disagree.
- [ ] `CHANGELOG.md` has a section for the version. The release notes are taken from it, and the release stops if it is missing.
- [ ] Any database migrations or new settings are explained under upgrading.
- [ ] If the SDK changed, `packages/sdk/CHANGELOG.md` is updated.

## Release

- [ ] The change is merged to `master`.
- [ ] The tag is pushed. See [Publishing a release](./deployment-and-production.md#publishing-a-release).
- [ ] The Release workflow passes. It runs the tests and boots the images before publishing anything.

## After release

- [ ] The GitHub release has `docker-compose.yml`, `env.example` and the right notes.
- [ ] The images pull while signed out of GitHub.
- [ ] A fresh install from the release files works.
- [ ] The npm packages are published. The Release workflow publishes `@gami.fied/sdk`, `@gami.fied/react` and `@gami.fied/elements` through npm's trusted publishing, with provenance, and skips a version that is already there. A pre-release such as `1.4.0-rc.1` goes under the `next` tag, not `latest`.
- [ ] The images are on Docker Hub, if you publish there. The workflow copies them, both platforms and the same tags, when the `DOCKERHUB_USERNAME` variable and the `DOCKERHUB_TOKEN` secret are set.

### Setting up publishing (once)

**npm** uses trusted publishing, so no npm token is stored anywhere. npm accepts a publish only with GitHub's proof that it comes from `release.yml` in this repository. For each of the three packages, open its **Settings** page on npmjs.com and add a trusted publisher:

- **Organization or user:** `gami-fied`, **Repository:** `gami.fied`, **Workflow filename:** `release.yml`
- **Environment name:** leave empty
- **Allow `npm publish`:** ticked. **Allow `npm dist-tag`:** not needed.
- Then, under **Publishing access**, choose "Require two-factor authentication and disallow bypass 2FA tokens". Trusted publishing still works, and no token can publish.

A trusted publisher can only be added to a package that already exists, so a new package's first version is published by hand (below). Until the trusted publisher is set up, the npm step of a release fails; the images and the GitHub release are not affected.

**Docker Hub** is optional. In the repository's **Settings → Secrets and variables → Actions**:

| Name                 | Kind               | What it is                                            |
| :------------------- | :----------------- | :---------------------------------------------------- |
| `DOCKERHUB_USERNAME` | Variable or secret | Your Docker Hub user or organization name.            |
| `DOCKERHUB_TOKEN`    | Secret             | A Docker Hub access token with read and write access. |

Without them, the release skips Docker Hub and says so.

### Publishing by hand

For a package's first version, or if the workflow could not publish, sign in with `npm login` and publish in this order, because each package depends on the one before:

```powershell
pnpm --filter "@gami.fied/sdk" publish --access public
pnpm --filter "@gami.fied/react" publish --access public
pnpm --filter "@gami.fied/elements" publish --access public
```

Each one builds and tests itself first. `pnpm publish` replaces `workspace:*` with the real version, which `npm publish` does not, so use pnpm.
