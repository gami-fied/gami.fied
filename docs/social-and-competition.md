# Segments, leagues and social play

This page covers who players are compared with, and how they play together: segments, team and country boards, leagues, friends, kudos, the activity feed, share cards and invites.

## Segments

A segment is a saved group of people, chosen by what you know about them. Conditions can read:

| Field | Meaning |
| --- | --- |
| `metadata.<key>` | Anything you stored on the user, such as `metadata.country` or `metadata.plan`. Up to five levels deep, like `metadata.address.city` |
| `name`, `email`, `externalId` | The user's own fields |
| `createdAt` | When they joined. Compare with a date |
| `totalXp` | Their all-time XP |

Operators are `equals`, `not_equals`, `in`, `not_in`, `contains`, `starts_with`, `exists`, `not_exists`, `greater_than` and `less_than`. Match `all` or `any` of up to 20 conditions.

Membership is worked out when a board is read, so people move in and out as their details change. Create segments on the **Segments** page, where a preview shows who matches as you type.

```http
POST /api/projects/:projectId/segments
{ "key": "india", "name": "India", "filter": { "match": "all", "conditions": [{ "field": "metadata.country", "operator": "equals", "value": "IN" }] } }
```

## Narrower boards

Any leaderboard call can be narrowed:

| Option | Effect |
| --- | --- |
| `?segment=india` | Only people in that segment, ranked among themselves |
| `?friendsOf=user_123` | Only that user and their friends |
| `?groupBy=metadata.team` | Teams, countries or any attribute ranked against each other, instead of people |
| `&score=average` | With `groupBy`: divide by members, so a small team can beat a big one |

Players get the same from their own token: `gami.me.leaderboard({ scope: 'friends' })`, `{ segment: 'india' }`, or `{ sameAs: 'metadata.country' }`, which ranks the people who share the player's own country without the app needing to know it.

People hidden from rankings are left out of every board, as before.

## Leagues

A league puts players in small groups of people at their own level. Each season (a week or a day, in UTC) the top of every group moves up a tier and the bottom moves down.

- **Tiers** go from lowest to highest, such as Bronze, Silver, Gold. Everyone starts in the first.
- **Groups** hold up to the group size. Players fill groups in order as they join, so a group is always full before another opens.
- A player **joins** each enabled league the first time they earn XP in a season. People who do nothing are never placed, so groups are not full of inactive accounts.
- **Standings** are the XP earned this season. Ties go to whoever joined first.
- The worker **closes** ended seasons on its regular pass. The top `promote` in each group move up (only if they earned XP), the bottom `relegate` move down, and nobody falls below the first tier or rises above the last. In a small group the two zones never overlap.

Read a player's group with `gami.me.leagues()`, or `GET /v1/users/:userId/leagues` from your server. Each row has a `zone` of `promotion`, `relegation` or `safe`, so a client can colour the table.

## Friends, kudos and the feed

- **Friends** go both ways and are stored both ways. Players add each other by **invite code**, so nobody's ID is ever exposed: `gami.me.addFriend(code)`. Your server can link users directly with `POST /v1/users/:userId/friends`. A player can have up to 500.
- **Kudos** are a small thank-you: `gami.me.giveKudos(code, 'Nice streak!')`. One per friend per day, and at most 30 a day from one person.
- The **feed** shows what a player and their friends did lately: achievements earned, kudos received and league promotions. `gami.me.feed()`.

## Share cards

`gami.me.shareAchievement('first_win')` returns a link to a 1200×630 image of the achievement with the player's name, for social media. The link is signed, so it cannot be guessed or edited to show someone else, and it stops working if the player is deactivated.

## Invites

Every player has an eight-character invite code, made the first time it is asked for. Set up rewards on the **Invites** page:

- XP for the inviter and for the new player, and optionally a currency for the inviter.
- When an invite counts: as soon as the code is used, or when the new player first sends an event you name, such as `first_purchase`. The second is harder to game.
- A limit on rewarded invites per player. Invites past it are still recorded, as `capped`, and only the new player is rewarded.

A code can be used once per person, only in their first 30 days, and never on yourself. Both sides are rewarded once, in one transaction, and a `referral.completed` webhook is sent.

```ts
const { code } = await gami.me.referral();     // show this to the player
await gami.me.useReferral('K7P2QX9M');          // on the new player's device
// or from your server, at sign-up
await gami.referrals.claim({ userId: 'user_456', code: 'K7P2QX9M' });
```

API keys need `segments:read`, `leagues:read`, `social:read` or `social:write`, and `referrals:read` or `referrals:write`.
