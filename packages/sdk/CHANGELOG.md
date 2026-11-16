# Changelog

## 1.3.0

For Gami.Fied 1.3.0. Upgrade the server first: several calls below use routes that only 1.3.0 has.

### Added

- `gami.mechanics` for boxes, season passes, teams, shared goals, cosmetics, journeys and leaderboard prizes, from your server.
- For players: `gami.me.boxes()`, `openBox()`, `passes()`, `claimPass()`, `buyPassPremium()`, `team()`, `teams()`, `joinTeam()`, `leaveTeam()`, `goals()`, `cosmetics()`, `buyCosmetic()`, `equipCosmetic()`, `unequipCosmetic()`, `journeys()` and `leaderboardPrizes()`.
- An inbox: `gami.me.notifications()` returns `read`, `readAt`, `unreadCount` and `hasMore`, and takes `unread`, `limit` and `before`. New: `unreadCount()`, `markNotificationRead()` and `markAllNotificationsRead()`.
- Translations: a `locale` option on the client, and `gami.me.setLocale()`.
- Web push: `gami.me.enableWebPush()`, `disableWebPush()`, `webPushKey()` and `registerWebPush()`, and `push-worker.js`, a service worker to copy to your site.
- `gami.endUserTokens.create()` takes `access: 'read' | 'write'`, and `gami.endUserTokens.revoke(userId)` ends a player's tokens.
- Friend requests: `gami.me.friendRequests()`, `acceptFriend()` and `declineFriend()`.
- The `box.opened`, `goal.completed`, `journey.completed` and `leaderboard.prize_paid` webhook types.

### Changed

- **Player tokens are read-only unless you ask for `access: 'write'`.** Calls that change something need a write token.
- `gami.me.addFriend(code)` sends a request. The players become friends when the other accepts.
- `gami.me.unregisterDevice(token)` sends the token in the body, so long tokens and browser addresses work. `gami.me.deleteDevice(token)` keeps the old form.
- `gami.me.get()` includes `locale` and `cosmetics`. Leaderboard rows include `title` and `frameUrl`, and challenges include `locked`.

## 1.1.0

For Gami.Fied 1.1.0. Everything is additive.

### Added

- `gami.streaks` for streak definitions, a user's streaks and their history.
- `gami.store` to list rewards, read balances and buy for a user, and `gami.me.wallets()`, `gami.me.store()`, `gami.me.redeem()` and `gami.me.redemptions()` for players.
- `gami.segments`, `gami.leagues`, `gami.social` and `gami.referrals`.
- `gami.leaderboards.list()` takes `segment` and `friendsOf`, and `gami.leaderboards.groups()` ranks teams, countries or any attribute.
- For players: `gami.me.leagues()`, `friends()`, `addFriend()`, `removeFriend()`, `feed()`, `giveKudos()`, `kudos()`, `referral()`, `useReferral()` and `shareAchievement()`, and `gami.me.leaderboard()` takes `scope`, `segment` and `sameAs`.
- `gami.me.subscribe()` listens for live notifications and XP, and reconnects on its own.
- The `referral.completed`, `reward.redeemed` and `reward.cancelled` webhook types.

### Changed

- Keys starting `gami_test_`, made for staging and development projects, are redacted from error messages like live keys.

## 1.0.0

The first stable release, for Gami.Fied 1.0.0 and the `/v1` API.

### Licence

- The SDK is now MIT licensed, so it can be used in closed-source apps. Versions before 1.0.0 remain AGPL-3.0-only. The Gami.Fied server stays AGPL-3.0.

### Added

- `gami.endUserTokens.create()` creates a short-lived token for your frontend.
- `gami.users.erase()` permanently removes a user and their personal data.

### Changed

- `projectId` is now optional on users, XP, levels, achievements, challenges and leaderboards, because the API key already identifies the project. Leaving it out uses the stable `/v1` routes, and is the recommended way to call them.

### Fixed

- `gami.achievements.listForUser()` now returns an array, as its type says. It used to return `{ data: [...] }`, which crashed code that looped over the result.

### Removed

- **Breaking:** `gami.organizations`. Those routes need a signed-in person, so they never worked with an API key or end-user token.
