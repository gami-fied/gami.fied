# Player token security

This page is the threat model for player tokens and the `/v1/me` routes: what a token is, what someone holding one can and cannot do, and what is left to you. Read it before you put tokens in a browser or a mobile app.

## What a token is

Your server creates a token for one player with `POST /v1/end-user-tokens` and an API key. The token is a signed statement of five things: the project, the player, when it expires, whether it may make changes, and the player's token version. Nothing is stored for it, and it cannot be changed without breaking the signature.

| Property | Value |
| :--- | :--- |
| Who it acts for | One player in one project, never anyone else |
| Lifetime | 15 minutes by default, one hour at most |
| Access | `read` by default. `write` only when your server asks for it |
| Ended early by | Deactivating or erasing the player, or `POST /v1/users/:userId/tokens/revoke` |
| Where it works | Any site, unless the project lists `allowedOrigins` |

## Who might hold a token

- **The player.** This is the normal case, and the player is not trusted: they can read the token out of their browser and call the API by hand.
- **A script on your page.** If your site has a cross-site scripting hole, the attacker's script holds the token until it expires or you end it.
- **Someone who copied it.** From a shared computer, a screenshot, a log, or a proxy that records addresses.

In every case the question is the same: what can the holder do?

## What a read token can do

It can read that one player's own data: profile name, XP, level, achievements and progress towards them, streaks, challenges, wallets, purchases with their codes, notifications, friends, incoming friend requests, kudos received, league groups, their invite code, their season pass, journeys, cosmetics, leaderboard prizes won, and what they added to shared goals.

It can also read what a player is meant to see about others:

- **Leaderboards**: other players' names, pictures, XP and level. Never their IDs, emails or metadata.
- **A board for a saved segment**, by the segment's key, and a board of people who share one of the player's own metadata values. Someone who guesses a segment key such as `vip` can see which names are on that board. Do not use segments for anything players must not learn about each other.
- **The feed** of their accepted friends: achievements, league promotions, and kudos those friends received, with the message.
- **The store**: the catalogue, prices and whether an item is in stock. Never unused reward codes.
- **Boxes**: every item in a box and its chance. This is meant to be public.
- **Teams**: every team's name, size and XP, and the names, pictures and XP of up to 50 members of the player's own team. Never IDs or emails.
- **Shared goals**: the total for everyone, or for the player's own team. Not other teams' totals, and not who contributed.

It cannot read another player's wallet, purchases, notifications or friends, look anyone up by ID or email, or see secret achievements before they are earned.

## What a write token adds

| Action | Limits |
| :--- | :--- |
| Buy a reward | Only with the player's own points. Stock and the per-player limit are checked in one transaction. An idempotency key never returns someone else's purchase |
| Ask someone to be friends | The other player must accept. 500 friends and 100 waiting requests at most |
| Give kudos | To a player whose invite code they have. One per person per day, 30 a day in all, 280 characters |
| Use an invite code | Once, in the player's first 30 days, never their own |
| Register a phone for push | That phone then gets this player's notifications |
| Open a box | Only with the player's own points, within the daily limit. The draw is made on the server. A player's tries at one box take turns |
| Claim season pass rewards, or buy the premium lane | Only for tiers their own season XP has reached. Each reward is given once |
| Buy, wear or take off a cosmetic | Only cosmetics they own or can pay for |
| Join or leave a team | One team at a time, within the team's size limit. Give read-only tokens if you place players in teams yourself |

A write token cannot grant XP, points, achievements or levels directly. Those come from events and rules, which need an API key, or from prizes a player is owed: a box they paid for, a pass tier they reached. A free box with no daily limit is an open tap, so give free boxes a daily limit. This is the main reason to keep event sending on your server.

## What limits abuse

- **Limits per player and per address.** One player's tokens share a request limit (`RATE_LIMIT_PLAYER_MAX`, 300 a minute by default), under the limit per address.
- **At most five live streams per player.**
- **Ending tokens.** Call `gami.endUserTokens.revoke(userId)` when a player signs out. Every token made for them before that stops working at once.
- **Allowed sites.** With `allowedOrigins` set, a browser on another site cannot use a token. This does not stop someone calling the API from a script, because only browsers send the header it checks.
- **Platform switches.** An administrator can turn the store, social features or referrals off for an organization, and the matching `/v1/me` routes then refuse.

## What is left to you

1. **Create tokens only for a player you have signed in.** Whoever can make your server mint a token for a user ID can act as that player. This is the most important rule.
2. **Ask for `write` only where a screen needs it.** A leaderboard or a profile page needs `read`.
3. **Keep lifetimes short** and make a new token when one expires. The React provider does not renew a token by itself: fetch a new one from your server and pass it in.
4. **Treat kudos messages and player names as untrusted text.** Players write them. Escape them when you show them, and moderate them if your app needs that. The React components escape them.
5. **Expect invites to be gamed.** Someone who can create accounts in your app can invite themselves. Require a qualifying event such as a first purchase, and set a limit per inviter.
6. **Do not log the stream address.** A browser's `EventSource` cannot send a header, so the stream takes the token as `?access_token=`. Gami.Fied removes it from its own logs, but a proxy in front may record it. The token is short-lived, which is what bounds the damage.
7. **Share links are public.** Anyone with the link sees the achievement and the player's name until the player is deactivated.

## Reviewed

Every `/v1/me` route was checked against this page on 14 November 2026, and the routes for boxes, passes, teams, goals, cosmetics, leaderboard prizes and journeys on 15 November 2026. A test (`player-api-contract.test.ts`) fails when a new player route is added without being documented and added to the SDK, which is the prompt to check it against this page too.

Not yet done: an independent security review (see [Security status](./security-audit.md)).
