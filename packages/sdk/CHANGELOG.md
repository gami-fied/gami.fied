# Changelog

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
