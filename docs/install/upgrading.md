# Upgrading

Gami.Fied follows [semantic versioning](https://semver.org). Patch and minor releases are safe to install over the one you have. A major release may need changes on your side, which its notes describe.

Every release is listed on [GitHub releases](https://github.com/gami-fied/gami.fied/releases), with the same notes as the [changelog](../../CHANGELOG.md).

## Before you upgrade

1. Read the notes for every version between yours and the new one, and look for anything marked as a breaking change or an upgrade step.
2. Take a backup. Start one from the **Backups** admin page, and for large installs also run `pg_dump` from outside the app. See [Backups](../backups.md).
3. Check that you still have `ENCRYPTION_MASTER_KEY`, because a backup cannot be restored without it.

## Upgrade

In the folder with your `docker-compose.yml`, set the version you want in `.env`:

```bash
GAMI_VERSION=1.1.0
```

Then pull the images and restart:

```bash
docker compose pull
docker compose up -d
```

The migration step runs before the API starts, so the database is brought up to date for you. If it fails, the API does not start, and `docker compose logs migration` shows why.

The compose file itself rarely changes. When a release changes it, its notes say so; download the new `docker-compose.yml` from that release and keep your `.env`.

## Check it worked

```bash
docker compose ps
curl http://localhost:3001/ready
```

Open the dashboard and send a test event. The [smoke test](../deployment-and-production.md#5-production-smoke-testing) lists what to check.

## Going back

Migrations only move forward, so going back to an older version means restoring the backup you took before upgrading:

1. Set `GAMI_VERSION` back to the version you had, and run `docker compose up -d`.
2. Restore your backup from the **Backups** admin page, or with `pnpm backup:restore --id <backup id>` from a checkout. See [Restoring](../backups.md#restoring).

Events received after the backup was taken are lost, so stop sending events first if you can.
