# Organization Logical Data Import Guide

This guide describes how an organization export is read back in, in **Gami.Fied Community Edition**.

## Import Authorization & Endpoints

Organization owners and admins can import into their organization.

- **Dry-Run Validation**: `POST /api/organizations/:organizationId/import/validate`
- **Transactional Import**: `POST /api/organizations/:organizationId/import`

Both accept files of version 1 and version 2. See [Data export](./data-export.md) for what a file holds.

## What changes and what stays

An import adds new projects to the organization. It never changes or deletes what is already there.

- **Row IDs are new.** Every imported row gets a new internal ID, and every reference between rows is rewritten to match, so a file can be imported next to the data it came from.
- **Your own names stay.** A player's `externalId`, and the keys of achievements, challenges, currencies, rewards, segments, leagues and streaks, are kept exactly. Your app's calls and your rules keep working against the imported project.
- **Projects keep their name and slug**, unless the organization already has a project with that slug. Then the copy gets `-imp-<id>` on its slug and "(Imported)" on its name.
- **XP totals** come from the file. A player with XP history but no total, which is every player in a version 1 file, gets one added up from the history.
- **Events are not processed again.** They are history, and no rule runs on them a second time.

## Safety checks

- **The organization's limits apply.** An import that would take the organization past its project limit is refused with `403 PROJECT_LIMIT`, and nothing is written.
- **Demo organizations cannot import** (`403 DEMO_IMPORT_DISABLED`).
- **Rules, challenges, levels and segments are checked** the way saving them in the dashboard checks them. Any that would not be accepted are left out, and the response lists each one with the reason under `warnings`.
- **A file cannot reach outside itself.** A reference is only followed to a row in the same file. A row that needs something the file does not contain is left out and counted under `skipped`, and an optional reference is cleared. So a file cannot attach its rows to another organization's players or projects.
- **One transaction.** If the rows in a file do not fit together, the import answers `422 IMPORT_INVALID` and nothing is changed.

## Dry-Run Validation Mode

`/import/validate` reads the file without writing anything and returns:

- `valid`: whether the import would be allowed, with `errors` when it would not
- `remappingPlan`: how many projects, players, events and other rows would be created
- `warnings`: rules, challenges, levels and segments that would be left out

## Response

```json
{
  "success": true,
  "projectIds": ["prj_5f0c..."],
  "importedCount": { "projects": 1, "endUsers": 42, "events": 1830, "users": 42 },
  "skipped": {},
  "warnings": []
}
```

`importedCount` has one entry per table. `users` repeats `endUsers` for older clients.

After an import, create new API keys, and set up webhooks, integrations and connectors again. Their secrets are never exported.
