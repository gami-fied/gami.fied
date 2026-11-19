# Habit Quest: a Gami.Fied example

A small habit tracker that gets its game parts from [Gami.Fied](https://gami.fied.cc). Tick off a habit, and the player earns XP and coins, keeps a daily streak, unlocks badges, moves up a weekly challenge and climbs the leaderboard. Then they spend their coins on a mystery box or a title to wear on the leaderboard.

The app is about 250 lines of code you can read in one sitting:

| File                                     | What it does                                                                                 |
| :--------------------------------------- | :------------------------------------------------------------------------------------------- |
| [`server.mjs`](server.mjs)               | An Express server. It holds the API key, sends events, and makes player tokens.              |
| [`public/index.html`](public/index.html) | The page. The game parts are Gami.Fied's [web components](https://gami.fied.cc/components/). |
| [`public/app.js`](public/app.js)         | Gets a token from the server, sends ticks, and shows the coin balance.                       |
| [`gami-design.json`](gami-design.json)   | The game itself: levels, coins, rules, streak, badges, challenge, titles and mystery box.    |

There is no game logic in the code. "10 XP and 5 coins per habit" or "a badge for all five in one day" are rules in Gami.Fied, so you can change them in the dashboard without touching the app.

### The game

| What             | How it works                                                                                                                                |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| ⭐ XP and levels | 10 XP per habit, from Beginner to Legend.                                                                                                   |
| 🪙 Coins         | 5 per habit, and 15 more for a perfect day (all five habits).                                                                               |
| 🔥 Streak        | At least one habit a day. One freeze a week saves a missed day.                                                                             |
| 🏅 Badges        | First step, 10 habits, Perfect day, 7-day streak and 50 habits.                                                                             |
| 🎯 Challenge     | 15 habits this week, for 50 bonus XP. It starts over every Monday.                                                                          |
| 🎁 Mystery box   | 20 coins a try, up to 3 a day. Prizes are coins, XP or the rare Lucky Star title, with the odds shown.                                      |
| 👑 Titles        | Early Bird, Zen Master and Habit Hero cost coins. The Golden frame comes with the Perfect day badge. A worn title shows on the leaderboard. |

## How it works

```
 Browser                      Your server (server.mjs)            Gami.Fied
 ───────                      ────────────────────────            ─────────
 tick "Drink water"  ──────►  events.track(habit_completed) ────►  rules run: XP, streak,
                                                                   badges, challenge
 GET /api/token      ──────►  endUserTokens.create()       ────►  a 15-minute token
 <gami-*> elements   ◄─────── token ─────────────────────────────  live progress,
                              (the API key never leaves here)       read with the token
```

1. **Your server sends events** with the API key. The key never reaches the browser.
2. **Your server makes a player token** for that one player, for 15 minutes. The page asks for a new one before it runs out. It has `write` access so the player can spend their own coins. A page that only shows progress should leave that out and get a read-only token.
3. **The web components draw everything** with that token, and update live when the player earns something. Opening the box and buying a title happen inside the components too, with no code of ours.

Each tick sends an `Idempotency-Key` made from the player, the habit and the day, so ticking the same habit twice in a day counts once.

## Run it

You need Docker. This starts Gami.Fied and the habit tracker together.

> [!NOTE]
> Importing the mystery box and titles from the design file needs Gami.Fied **1.3.1 or later**. On 1.3.0, the import adds everything else and skips those two, so create them on the **Mystery boxes** and **Cosmetics** pages instead, copying the values from `gami-design.json`.

1. **Make a `.env`.** Copy `.env.example` to `.env`, and fill in the five Gami.Fied secrets with long random values, for example from `openssl rand -base64 32`.

2. **Start everything.**

   ```bash
   docker compose up -d
   ```

3. **Set up Gami.Fied** at <http://localhost:3000>:
   1. Sign up, and create a project.
   2. Open **Promote changes**, click **Import a design file**, and choose [`gami-design.json`](gami-design.json). The preview lists the coins, levels, rules, streak, badges, challenge, titles and mystery box. Click **Import**.
   3. In **Settings**, add `http://localhost:4000` to **Sites allowed to use end-user tokens**. Player tokens only work on pages from these addresses.
   4. In **API Keys**, create a key with the `events:write` and `users:write` scopes.

4. **Give the key to the habit tracker.** Put it in `.env` as `GAMI_API_KEY`, then restart that one container:

   ```bash
   docker compose up -d habits
   ```

5. Open <http://localhost:4000> and tick a habit. 🔥

### Already running Gami.Fied?

Skip Docker. Do step 3 on your own install, then:

```bash
npm install
cp .env.example .env   # set GAMI_URL to your dashboard's address, and GAMI_API_KEY
npm start
```

## Make it your own

- **Change the game in the dashboard.** More XP, a new badge, a cheaper box or a new title are all changes in the dashboard. No code changes needed.
- **Use your own users.** `playerOf()` in `server.mjs` reads an anonymous cookie. In your app, use your signed-in user's ID instead.
- **Keep ticks in your database.** The page remembers today's ticks in `localStorage` to keep the example small. Gami.Fied still counts each habit once a day, so nothing can be counted twice.
- **Restyle the components.** They read CSS variables such as `--gami-accent` and `--gami-radius`. See `public/styles.css`.
- **Days are UTC.** The streak and the "Perfect day" badge count days in UTC. Set a time zone on the streak in the dashboard to change that.

## Put it online

The same `docker-compose.yml` runs on a server. Put a reverse proxy with HTTPS (Caddy, Traefik, nginx) in front of it:

- `https://habits.example.com` → port `4000` (the habit tracker)
- `https://habits-admin.example.com` → port `3000` (the Gami.Fied dashboard; the browser reads progress through it)

Then in `.env`:

```bash
DASHBOARD_URL=https://habits-admin.example.com
TRUST_PROXY=true
```

Run `docker compose up -d` again. Add `https://habits.example.com` to **Sites allowed to use end-user tokens**. Once you've signed up, [claim the platform admin](https://gami.fied.cc/docs/platform-administration/) and turn off **Allow public sign-up** in the server settings, so nobody else can make an account on your dashboard.

Visitors don't sign up for the habit tracker. Each gets an anonymous player with a made-up name such as "Brave Otter 42", so nobody can put their own text on the public leaderboard, and the server limits how fast each player can tick.

## License

MIT. Copy it, change it, ship it.
