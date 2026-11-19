// A habit tracker that uses Gami.Fied for its game parts.
//
// The pattern to copy:
//   1. Your server holds the API key, and tells Gami.Fied what players do (events).
//   2. Your server makes a short-lived token for one player, and hands it to the browser.
//   3. The browser uses that token to show the player's own progress. It never sees the API key.
//
// The XP, levels, streak, badges and challenge are not in this file. They are rules in
// Gami.Fied, imported from gami-design.json, so you can change them without touching the code.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Gami, GamiError } from '@gami.fied/sdk';

const { GAMI_URL, GAMI_API_KEY, PUBLIC_GAMI_URL, PORT = '4000' } = process.env;
const configured = Boolean(GAMI_URL && GAMI_API_KEY);
if (!configured)
  console.warn(
    'Set GAMI_URL and GAMI_API_KEY (see .env.example). The page will say so until you do.'
  );

const gami = configured ? new Gami({ baseUrl: GAMI_URL, apiKey: GAMI_API_KEY }) : null;

/** The habits a player can tick. A real app would let people make their own. */
const HABITS = ['water', 'read', 'walk', 'meditate', 'code'];

const app = express();
// Behind a reverse proxy (as in the live deploy), trust it for the visitor's address and HTTPS.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));

const notConfigured = 'This server has no Gami.Fied API key yet. Set GAMI_API_KEY and restart it.';
app.use('/api', (_req, res, next) => {
  if (configured) return next();
  res.status(503).json({ error: notConfigured });
});

// A gentle limit per player, so nobody can flood the leaderboard.
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
function tooMany(key) {
  const count = (hits.get(key) ?? 0) + 1;
  hits.set(key, count);
  return count > 30;
}

/** A friendly made-up name, so nobody types text onto the public leaderboard. */
function randomName() {
  const words = ['Brave', 'Calm', 'Sunny', 'Swift', 'Clever', 'Mighty', 'Happy', 'Steady'];
  const animals = ['Otter', 'Panda', 'Falcon', 'Tiger', 'Koala', 'Fox', 'Dolphin', 'Owl'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(words)} ${pick(animals)} ${Math.floor(Math.random() * 90) + 10}`;
}

/** The player ID from the cookie. Your app would use its own signed-in user's ID instead. */
function playerOf(req) {
  const id = req.cookies.player;
  return typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id) ? id : null;
}

// Signs the visitor in as a player, creating one on the first visit.
app.post('/api/session', async (req, res, next) => {
  try {
    let player = playerOf(req);
    if (!player) {
      if (tooMany(`ip:${req.ip}`)) return res.status(429).json({ error: 'Slow down a little.' });
      player = randomUUID();
      res.cookie('player', player, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        maxAge: 365 * 24 * 3600 * 1000,
      });
    }
    // Creating the player first gives them a display name (sending an event would also create
    // them, just without one). It runs on every visit, so a player that was erased, or a cookie
    // from another project, is simply made again. 409 means they already exist.
    try {
      await gami.users.create({ externalId: player, name: randomName() });
    } catch (err) {
      if (!(err instanceof GamiError && err.status === 409)) throw err;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// A token for the browser, for this one player only. `write` lets them spend their own coins:
// open the mystery box and buy titles. Leave it out (read only) if your page only shows progress.
app.get('/api/token', async (req, res, next) => {
  const player = playerOf(req);
  if (!player) return res.status(401).json({ error: 'Start a session first.' });
  try {
    const { token, expiresAt } = await gami.endUserTokens.create({
      userId: player,
      expiresInSeconds: 900,
      access: 'write',
    });
    res.json({ token, expiresAt, baseUrl: PUBLIC_GAMI_URL || GAMI_URL });
  } catch (err) {
    next(err);
  }
});

// The one line that matters: tell Gami.Fied what happened.
app.post('/api/habits/:habit/done', async (req, res, next) => {
  const player = playerOf(req);
  const { habit } = req.params;
  if (!player) return res.status(401).json({ error: 'Start a session first.' });
  if (!HABITS.includes(habit)) return res.status(404).json({ error: 'No such habit.' });
  if (tooMany(player)) return res.status(429).json({ error: 'Slow down a little.' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    await gami.events.track({
      userId: player,
      type: 'habit_completed',
      properties: { habit },
      // Same player, habit and day means the same event: ticking twice still counts once.
      idempotencyKey: `${player}:${habit}:${today}`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err instanceof GamiError ? `Gami.Fied said ${err.status}: ${err.message}` : err);
  res.status(502).json({ error: 'Could not reach Gami.Fied.' });
});

app.listen(Number(PORT), () => console.log(`Habit tracker on http://localhost:${PORT}`));
