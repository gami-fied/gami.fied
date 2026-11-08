# Features and organization rules

Platform administrators decide what this instance offers, and set limits and security rules for each organization. Both live in the admin area.

## Features

**Admin → Features** lists every feature, grouped by area, with a switch each. Hover a feature to see what it needs (orange) and what needs it (blue).

- **Base features** (Events, Players, Rules and XP) are what everything else is built on. They are always on and cannot be switched off.
- **Dependencies** are respected both ways. Turning a feature off also turns off everything that needs it, and turning one on also turns on what it needs. When a change affects other features, you see exactly which before anything happens.
- **Organizations** can be narrowed from their own page: **Admin → Organizations → (an organization) → Features**. An organization can have a feature turned off even when the instance has it on, but never the other way round. **Follow instance** removes all of an organization's own settings.
- **Nothing is deleted.** A feature that is off keeps its data, and everything comes back as it was when it is turned on again.

### What turning a feature off does

| Where | Effect |
| --- | --- |
| Dashboard | The page leaves the sidebar and search. Opening it directly explains that it is turned off. |
| API | Its routes, including `/v1` and `/v1/me`, answer `403` with `{ "code": "FEATURE_DISABLED", "feature": "<key>" }`. |
| Worker | It stops running: rule actions for it are skipped (the rule still completes), streaks, challenges, leagues and invites stop counting, boosts and limits stop applying, campaigns stop sending, and webhooks, chat integrations and push stop delivering. |

Settings are cached for up to 30 seconds in each API and worker process, so a change reaches every process within that time.

### Feature keys

| Key | Needs |
| --- | --- |
| `events`, `users` | Base |
| `rules` | Base, needs `events` |
| `xp` | Base, needs `users` |
| `levels`, `leaderboards`, `referrals` | `xp` |
| `achievements`, `environments`, `expressions`, `plugins` | `rules` |
| `streaks`, `webhooks`, `integrations`, `connectors`, `analytics` | `events` |
| `challenges` | `events`, `xp` |
| `boosts_limits` | `rules`, `xp` |
| `segments`, `wallets`, `social`, `campaigns`, `realtime`, `push` | `users` |
| `leagues` | `leaderboards` |
| `store` | `wallets` |

## Organization rules

**Admin → Org Defaults** sets the rules every organization gets. Each organization's **Limits & security** tab can override any of them; a blank field uses the default, which is shown beside it.

| Rule | Enforced when |
| --- | --- |
| Most projects | A project is created |
| Most members | Someone is invited. Pending invitations count, so a burst of invites cannot get past it |
| Allowed email domains | Someone is invited. Subdomains are included |
| Event requests per minute, per project | `POST /v1/events` and `/v1/events/batch`. The instance-wide rate limit still applies on top |
| API key lifetime | A key is created. A key made without an expiry gets the longest allowed |
| Allowed addresses | Every API key request, including events and player-token creation. Single addresses and CIDR ranges, IPv4 and IPv6 |
| Projects must list their sites | A player token is used. Until a project lists its allowed sites, `/v1/me` answers `ORIGINS_REQUIRED` |

Every change is written to the audit log with what changed.

## People and access

Each organization's **People & access** tab shows its members, how many devices each is signed in on, pending invitations and active API keys. From there a platform administrator can:

- **Change a member's role**, or **remove** them. An organization always keeps at least one owner.
- **Revoke every API key** at once, after a suspected leak.
- **Sign everyone out** on every device. They can sign in again unless the organization is suspended.
- **Suspend** or **reactivate** the organization from its header. Suspension locks members out, stops API keys and refuses events, without deleting anything.

## Velocity flags

Each project's **Boosts & limits → Flags** tab can flag anyone who earns more than a set amount of XP, or sends more than a set number of events, in an hour. Flags never block XP. With auto-hide on, a flagged person also drops out of rankings until someone reviews the flag. Confirming keeps them hidden; dismissing undoes an automatic hide. Each kind of flag is raised at most once an hour per person.
