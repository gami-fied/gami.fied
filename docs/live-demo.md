# Running a live demo instance

A demo instance lets anyone try the dashboard without an account. A visitor opens `/demo`, passes a quick check, and lands in a workspace of their own: a made-up language app with 36 players, a month of activity, rules, badges, a streak, a store and a league. After 24 hours the workspace and the visitor's account are deleted.

Run demos on **their own instance**, with their own database and Redis, and never on an install that holds real data. Everything below is off unless you turn it on.

## Turning it on

Set these on the API and the worker:

| Variable | Default | What it does |
| :--- | :--- | :--- |
| `GAMI_DEMO_MODE` | off | `true` offers demos at `/demo` and starts the cleanup. It also stops all email. |
| `GAMI_DEMO_TTL_HOURS` | `24` | How long a demo lives. |
| `GAMI_DEMO_MAX_LIVE` | `200` | Most demos alive at once. |
| `GAMI_DEMO_STARTS_PER_HOUR` | `3` | Demos one address can start in an hour. |
| `TURNSTILE_SITE_KEY` | none | The Cloudflare Turnstile site key, shown to visitors. |
| `TURNSTILE_SECRET_KEY` | none | The Turnstile secret, used to check each start. |

Without the Turnstile keys, starting a demo needs no check, and the API logs a warning at start-up. That is fine on your own machine, but set both keys before the instance is public. Cloudflare's [testing keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) work for staging.

The limit per address needs the visitor's real address, so set `TRUST_PROXY=true` behind a reverse proxy. See [Reverse proxy and HTTPS](./install/reverse-proxy.md).

On the website, set `PUBLIC_DEMO_URL` to the demo dashboard's address, such as `https://demo.gami.fied.cc`, and the "Try the dashboard" buttons appear.

## What a demo can do

Each demo is an organization locked down with the [organization rules](./platform-administration-features.md):

- **Off:** webhooks, Slack, Teams and HTTP integrations, connectors, campaigns, push notifications and plugin actions, so nothing reaches outside the instance.
- **Limits:** one project, one member, 120 events a minute, and API keys that last at most a day.
- **No email at all:** a demo instance never sends email, whatever SMTP settings it has.

Visitors get a real account with an address that cannot receive mail (`@demo.invalid`) and a password nobody knows. Their session works only in that browser.

The banner across the top of a demo shows when it will be deleted, and has a **Send traffic** button that sends a burst of lessons from random players, so leaderboards, the feed and toasts move. It can be pressed every few seconds.

**Keep this setup** downloads the demo's design (its rules, badges, streak, store and league) as a [design file](./connectors-environments-and-plugins.md#design-files), which an install of your own can import on its **Promote changes** page.

## Seeded data

The players and their lessons are generated for each demo, so no two look the same. Their events are queued like any others, so the worker works out XP, levels, badges, gems and league places with the real engine. This takes a few seconds after the demo starts, and the dashboard fills in as it goes. Streaks are written directly, because the worker handles events in parallel.

## Cleanup

Every ten minutes, one worker deletes the demos that have expired, with everything in them, and each visitor's account unless it also belongs to an organization that is still live. Platform admin accounts are never deleted. A demo left behind by a stopped worker is caught on the next pass.

## Capacity

When `GAMI_DEMO_MAX_LIVE` demos are live, new visitors see a message to try again later. The API exposes these on `/metrics`:

| Metric | What it is |
| :--- | :--- |
| `gami_demo_live` | Demos live now |
| `gami_demo_capacity` | `GAMI_DEMO_MAX_LIVE` |
| `gami_demo_refused_total{reason}` | Starts refused, by `rate_limited`, `capacity` or `challenge` |

The [example alerts](https://github.com/gami-fied/gami.fied/blob/master/deploy/prometheus/alerts.yml) warn when more than 90% of slots are in use, and page when visitors are turned away. To make room, raise the limit, or lower `GAMI_DEMO_TTL_HOURS` so demos expire sooner.

## Upgrading

Upgrade the demo instance with each release, the same way as any other install. See [Upgrading](./install/upgrading.md). Demos last a day, so there is no need to keep their data across upgrades.
