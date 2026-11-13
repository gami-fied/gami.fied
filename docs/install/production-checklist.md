# Production checklist

Go through this list before real players use your instance. Each item links to the guide that explains it.

## Secrets

- [ ] `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `BETTER_AUTH_SECRET`, `ENCRYPTION_MASTER_KEY` and `PLATFORM_BOOTSTRAP_SECRET` are long random values, made with `openssl rand -hex 32`. See [Install with Docker Compose](./docker-compose.md#2-fill-in-the-secrets).
- [ ] A copy of `ENCRYPTION_MASTER_KEY` is kept somewhere other than the server. Backups cannot be restored without it.
- [ ] `.env` is readable only by the user that runs Docker (`chmod 600 .env`), and is not in version control.

## Network

- [ ] The instance is behind a reverse proxy with HTTPS. See [Reverse proxy and HTTPS](./reverse-proxy.md).
- [ ] `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` are the public `https://` addresses.
- [ ] `TRUST_PROXY=true` is set only because a proxy overwrites `X-Forwarded-*` headers.
- [ ] The API and dashboard ports are not published on the host, only reached through the proxy. PostgreSQL and Redis are never published.
- [ ] `TRUSTED_ORIGINS` lists only the sites that need to call the API from a browser.

## Accounts and access

- [ ] The first platform admin is claimed. See [Platform administration](../platform-administration.md#1-becoming-a-platform-admin).
- [ ] Public sign-up and organization creation are set the way you want on the **Server Settings** page. See [Instance settings](../deployment-and-production.md#instance-settings).
- [ ] Security rules (password length, lockouts, session length) are reviewed on the **Security** page. See [Authentication and security](../authentication-and-security.md).
- [ ] API keys are used only on servers. Browsers and apps use short-lived player tokens. See [API authentication](../api-authentication.md).

## Email

- [ ] SMTP is set up, on the **Server Settings** page or with the `SMTP_*` variables, and a test email arrives. Without it, password resets and email verification cannot be sent.

## Backups

- [ ] Scheduled backups are on, with `backupIntervalHours` in the retention settings. See [Data retention](../data-retention.md).
- [ ] Backups are copied off the server, and for large installs a `pg_dump` runs as well. See [Backups](../backups.md).
- [ ] A restore has been tried on a test machine. See the [disaster recovery playbook](../disaster-recovery.md).

## Monitoring

- [ ] An uptime check calls `GET /ready`. See [Health checks](../deployment-and-production.md#3-health-checks--readiness-probes).
- [ ] Prometheus scrapes the metrics, with the example alerts loaded. See [Operations](../operations.md).
- [ ] Logs are kept long enough to look into problems, for example with Docker's log rotation.

## Before launch

- [ ] The [smoke test](../deployment-and-production.md#5-production-smoke-testing) passes: sign in, send an event, see the reward.
- [ ] You know how to [upgrade](./upgrading.md), and how to go back.
- [ ] Data retention matches your privacy policy. See [Data retention](../data-retention.md).
