# Install with Docker Compose

This is the recommended way to run Gami.Fied. Each release publishes ready-made images, so there is nothing to build. One Compose file starts PostgreSQL, Redis, a migration step, the API, the worker and the dashboard.

The files come from the [latest release](https://github.com/gami-fied/gami.fied/releases/latest). Its compose file is pinned to that version.

## What you need

- A Linux server, or any machine with Docker. Images are published for `linux/amd64` and `linux/arm64`.
- Docker with the Compose plugin (`docker compose version` should work).
- A domain name and a reverse proxy for HTTPS, if people outside your network will use it. See [Reverse proxy and HTTPS](./reverse-proxy.md).

## 1. Download the release files

```bash
mkdir gami-fied && cd gami-fied
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/env.example
cp env.example .env
```

## 2. Fill in the secrets

Open `.env` and give each of these a long random value. `openssl rand -hex 32` makes one.

| Variable | What it is for |
| :--- | :--- |
| `POSTGRES_PASSWORD` | The database password. Compose will not start without it |
| `REDIS_PASSWORD` | The Redis password. Compose will not start without it |
| `BETTER_AUTH_SECRET` | Signs dashboard sessions |
| `ENCRYPTION_MASTER_KEY` | Encrypts stored secrets and backups. Keep a copy somewhere safe: backups cannot be restored without it |
| `PLATFORM_BOOTSTRAP_SECRET` | Lets you claim the first platform admin account |

Then set the addresses people will use:

| Variable | Example |
| :--- | :--- |
| `BETTER_AUTH_URL` | `https://api.example.com` |
| `NEXT_PUBLIC_APP_URL` | `https://app.example.com` |

For a first try on your own machine, the `localhost` defaults in the file work as they are. Every other option, including email (`SMTP_*`), is described in `.env` and in [Deployment and production](../deployment-and-production.md#2-production-environment-variable-checklist).

## 3. Start it

```bash
docker compose up -d
```

The migration step runs first, then the API, worker and dashboard start. Check that everything is healthy:

```bash
docker compose ps
curl http://localhost:3001/ready
```

The dashboard is at `http://localhost:3000`.

## 4. Claim the first platform admin

Create an account in the dashboard, then [become a platform admin](../platform-administration.md#1-becoming-a-platform-admin) with `PLATFORM_BOOTSTRAP_SECRET`. From there you can create an organization, a project and an API key.

## Next steps

- Send your first event with a [quickstart](../quickstarts/rest.md).
- Put it behind [a reverse proxy with HTTPS](./reverse-proxy.md).
- Go through the [production checklist](./production-checklist.md) before real players use it.
- Learn how to [upgrade](./upgrading.md) when a new release comes out.

To run it on Render, DigitalOcean, Coolify or Railway instead, see [One-click deploys](./one-click.md). To build the images from source, see [Installing from published images](../deployment-and-production.md#installing-from-published-images).
