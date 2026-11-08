# Changelog

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
