# One-click deploys

These set up Gami.Fied on a hosting platform with a few clicks: the dashboard, the API, the worker, PostgreSQL and Redis, with the database brought up to date on every deploy.

> [!WARNING]
> None of these has been tried on a real account yet. The files follow each platform's documentation, but until someone has deployed with them, treat them as a starting point and check each step. [Docker Compose](./docker-compose.md) is the tested way to install.

On every platform, only the **dashboard** is public. It forwards `/api` and `/v1` to the API over the platform's private network, so your app, the SDK and the React components all use the dashboard's address.

After any of them, [claim the first platform admin](../platform-administration.md#1-becoming-a-platform-admin) with `PLATFORM_BOOTSTRAP_SECRET`, and keep a copy of `ENCRYPTION_MASTER_KEY` somewhere safe: backups cannot be restored without it.

## Render

[`render.yaml`](https://github.com/gami-fied/gami.fied/blob/master/render.yaml) is a Render Blueprint.

1. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/gami-fied/gami.fied).
2. Render asks for `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`. Enter the dashboard's address, such as `https://gami-dashboard.onrender.com`. You can change it later if you add your own domain.
3. Render creates the services, a PostgreSQL database and a Key Value store (Redis), and generates the secrets.

The API runs as a private service, and its `preDeployCommand` runs the migrations. The secrets are in the `gami-secrets` environment group.

## DigitalOcean App Platform

[`.do/deploy.template.yaml`](https://github.com/gami-fied/gami.fied/blob/master/.do/deploy.template.yaml) is an App Platform app spec.

1. Open [Deploy to DigitalOcean](https://cloud.digitalocean.com/apps/new?repo=https://github.com/gami-fied/gami.fied/tree/master).
2. Fill in `BETTER_AUTH_SECRET`, `ENCRYPTION_MASTER_KEY` and `PLATFORM_BOOTSTRAP_SECRET` with long random values, for example from `openssl rand -hex 32`. They are app-wide, so each is entered once.
3. Create the app. A `PRE_DEPLOY` job runs the migrations before each deploy.

The app's address (`${APP_URL}`) is filled in for `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` for you. The PostgreSQL database is a development database; switch it to a managed cluster before real players use it. Redis is a managed Valkey cluster.

## Coolify

[`deploy/coolify/docker-compose.yml`](https://github.com/gami-fied/gami.fied/blob/master/deploy/coolify/docker-compose.yml) is a Compose file that uses Coolify's generated values.

1. In Coolify, create a resource from **Docker Compose** and paste the file.
2. Coolify generates the database and Redis passwords and the secrets (`SERVICE_PASSWORD_*` and `SERVICE_BASE64_*`), and gives the dashboard a domain.
3. Deploy. The `migration` service runs once and exits before the API starts.

Check that `SERVICE_URL_DASHBOARD` starts with `https://` in the resource's environment variables. The API uses it as its public address.

## Railway

Railway templates are made in Railway's own dashboard, so this is a list of steps. Once someone has followed them, the result can be published as a template with a one-click link.

1. Create a project, and add **PostgreSQL** and **Redis** from the database menu.
2. Add three services from Docker images: `ghcr.io/gami-fied/gami-api:latest`, `ghcr.io/gami-fied/gami-worker:latest` and `ghcr.io/gami-fied/gami-dashboard:latest`. Name them `api`, `worker` and `dashboard`.
3. On `api` and `worker`, add these variables. Make the three secrets long random values, the same on both services, for example by adding them as shared variables:

   ```bash
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   NODE_ENV=production
   TRUST_PROXY=true
   BETTER_AUTH_URL=https://${{dashboard.RAILWAY_PUBLIC_DOMAIN}}
   NEXT_PUBLIC_APP_URL=https://${{dashboard.RAILWAY_PUBLIC_DOMAIN}}
   BETTER_AUTH_SECRET=...
   ENCRYPTION_MASTER_KEY=...
   PLATFORM_BOOTSTRAP_SECRET=...
   ```

4. On `api`, also set `PORT=3001` and `HOST=0.0.0.0`, and set its pre-deploy command to `node packages/database/dist/migrate.js`.
5. On `dashboard`, set `PORT=3000` and `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001`, and generate a public domain for it under **Networking**.

## Upgrading

Every platform here runs the `latest` images, so redeploying picks up a new release. To stay on one version, change `latest` to a version such as `1.2.0` in the file or the service settings, then follow [Upgrading](./upgrading.md) when you move on. Read the release notes first.
