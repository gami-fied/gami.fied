# Example app: a habit tracker

[`examples/habit-tracker`](https://github.com/gami-fied/gami.fied/tree/master/examples/habit-tracker) is a small, complete app that uses Gami.Fied the way a real one would. Players tick off daily habits, and Gami.Fied handles the XP, levels, coins, a daily streak, five badges, a weekly challenge and a leaderboard. Players spend their coins on a mystery box, or on titles they wear on the leaderboard.

It is about 250 lines: an Express server and one HTML page that uses the [web components](./web-components.md). Read it to see how the pieces fit, or copy it as a starting point.

## What it shows

- **The server sends events, with the API key.** One `gami.events.track()` call per tick. The API key never reaches the browser.
- **The browser gets a player token.** The server makes a 15-minute token for one player with `gami.endUserTokens.create()`, and the page asks for a fresh one before it expires. It has `write` access, so the player can spend their own coins. See [Player token security](./player-token-security.md).
- **Components draw the game parts.** `<gami-level-progress>`, `<gami-streak-calendar>`, `<gami-challenge-list>`, `<gami-mystery-box>`, `<gami-cosmetic-locker>`, `<gami-badge-grid>`, `<gami-leaderboard>` and `<gami-toasts>`, all updating live. Opening the box and buying a title happen inside the components.
- **Earning and spending.** Habits pay coins, and the box and titles cost them. The page reads the balance with `GamiElements.client().me.wallets()`.
- **Idempotency stops double counting.** Each tick sends a key made from the player, the habit and the day, so ticking twice counts once. See [Idempotency](./idempotency.md).
- **The game lives in Gami.Fied, not in the code.** The levels, coins, rules, streak, badges, challenge, titles and mystery box come from a [design file](./connectors-environments-and-plugins.md#design-files), `gami-design.json`, so you change the game in the dashboard. Importing the titles and the mystery box needs Gami.Fied 1.3.1 or later.

## Run it

The example has its own `docker-compose.yml` that starts Gami.Fied and the habit tracker together:

1. Copy `.env.example` to `.env`, and fill in the Gami.Fied secrets.
2. Run `docker compose up -d`, and open the dashboard at `http://localhost:3000`.
3. Create a project. On **Promote changes**, import `gami-design.json`.
4. In **Settings**, add `http://localhost:4000` to **Sites allowed to use end-user tokens**.
5. Create an API key with the `events:write` and `users:write` scopes, put it in `.env` as `GAMI_API_KEY`, and run `docker compose up -d habits`.
6. Open `http://localhost:4000`.

With Gami.Fied already running, skip Docker: do steps 3 to 5 on your install, set `GAMI_URL` in `.env`, then run `npm install` and `npm start`.

The [example's README](https://github.com/gami-fied/gami.fied/tree/master/examples/habit-tracker#readme) also covers putting it online behind HTTPS, and what to change for your own app.
