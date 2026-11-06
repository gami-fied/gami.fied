# API versioning

## What's stable

**`/v1/*` is the stable public API.** New fields and optional parameters can be added without a new version, so ignore fields you don't recognise. A breaking change would go in a new version, such as `/v2`, while `/v1` keeps working.

**`/api/*` is not stable.** These routes serve the dashboard and can change in any release. Don't build on them.

The SDK uses `/v1` for users, XP, levels, achievements, challenges and leaderboards when you leave out `projectId`. Its webhook, integration, notification, analytics and audit log methods use `/api/projects`, because those have no public route yet.

## Releases

Gami.Fied and the SDK follow [Semantic Versioning](https://semver.org). See the [changelog](../CHANGELOG.md).

## Deprecation

If a `/v1` route is going to be removed, it will be announced in the changelog at least 6 months beforehand.
