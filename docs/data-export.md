# Organization Logical Data Export Guide

This guide describes the file an organization export produces in **Gami.Fied Community Edition**.

## Export Scope & Authorization

Organization owners and admins can export their organization. An export contains only data belonging to the requested organization.

- **Endpoint**: `POST /api/organizations/:organizationId/export`
- **Dashboard UI**: `/dashboard/organization/data`

## What an export holds

An export holds each project's design and its players' data:

| Area | Tables |
| :--- | :--- |
| Projects and players | `projects`, `endUsers`, `events` |
| Rules | `rules`, `ruleVersions`, `ruleExecutions` |
| XP and levels | `xpLedger`, `userXpBalances`, `levels` |
| Achievements | `achievements`, `userAchievements`, `userAchievementProgress` |
| Challenges | `challenges`, `userChallengeProgress`, `challengeEventProgress` |
| Streaks | `streakDefinitions`, `userStreaks`, `streakHistory` |
| Boosts and limits | `xpBoosts`, `xpLimits`, `xpLimitHits`, `abuseSettings`, `abuseFlags` |
| Wallets and the store | `currencies`, `walletLots`, `walletEntries`, `rewards`, `rewardCodes`, `redemptions` |
| Segments and leagues | `segments`, `leagues`, `leagueSeasons`, `leagueMembers` |
| Community | `friendships`, `friendRequests`, `kudos`, `referralPrograms`, `referralCodes`, `referrals` |
| Messages | `notifications`, `notificationPreferences`, `lifecycleCampaigns`, `lifecycleSends` |

Reward codes that have not been handed out yet are part of the store, so they are in the file. Treat an export as you would the database.

## What an export leaves out

- **Secrets**: API keys, connector secrets, webhook signing secrets and integration credentials. Webhooks and integrations are listed by name and address under `webhooks` and `integrations`, so you can set them up again, without their secrets.
- **Staff accounts**: dashboard users, their passwords and sessions, members, invitations and project assignments.
- **Work in progress**: events waiting to be processed and deliveries waiting to be sent.
- **Device tokens** for push notifications, which only work with credentials that are not moved.
- **Server settings**: feature switches, organization policies and the audit log.
- **Other organizations' data.**

Every table in the database is on one of these two lists, and a test fails when a new table is on neither.

## Export Package Structure

```json
{
  "format": "gami-organization-export",
  "version": 2,
  "exportedAt": "2026-11-13T12:00:00.000Z",
  "manifest": {
    "organizationId": "org_123",
    "organizationName": "Acme Corp",
    "appVersion": "1.3.0",
    "projectCount": 2,
    "userCount": 42,
    "rows": { "projects": 2, "endUsers": 42, "events": 1830 }
  },
  "organization": { "name": "Acme Corp", "slug": "acme" },
  "tables": {
    "projects": [],
    "endUsers": [],
    "events": [],
    "rules": []
  },
  "webhooks": [],
  "integrations": []
}
```

Version 1 files, made by 1.2.0 and earlier, hold ten tables at the top level (`projects`, `users`, `events` and so on). They can still be imported.
