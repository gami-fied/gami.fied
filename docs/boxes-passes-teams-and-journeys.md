# Boxes, passes, teams, cosmetics and journeys

This page covers six mechanics that build on events, XP, currencies and challenges: random rewards, a season pass, teams with shared goals, cosmetics, prizes for leaderboard places, and journeys.

Each one is a feature the platform administrator can turn off for an organization. Each has a page in the dashboard, routes under `/api/projects/:projectId/` for your team, routes under `/v1/` for your server, and routes under `/v1/me/` for the player.

## Prizes

All six pay out in the same way: a list of prizes. A prize is one of:

| Prize | Example |
| --- | --- |
| XP | `{ "type": "xp", "amount": 50 }` |
| A currency | `{ "type": "currency", "currency": "gems", "amount": 20 }` |
| A badge | `{ "type": "achievement", "achievement": "first_order" }` |
| A cosmetic | `{ "type": "cosmetic", "cosmetic": "night_owl" }` |

A prize names what it gives by **key**, so a design can be exported and imported unchanged. Saving is refused when a prize names a currency, badge or cosmetic that does not exist.

A list of prizes is paid in one transaction: a player gets all of it or none of it. Each payout is recorded under its own name, so a retry after a crash pays nothing twice. XP from a prize is not multiplied by boosts or held back by limits, because those apply to rules.

## Mystery boxes and wheels

A box holds items. One try gives one item, picked by weight: an item's chance is its weight divided by the sum of all weights.

- **The odds are published.** `GET /v1/me/boxes` returns every item with its chance as a percentage, and the React component shows it. Do not hide it.
- **Cost.** A box is free, or costs a currency. The cost, the draw and the prizes happen together: if a prize cannot be paid, nothing is charged.
- **Daily limit.** At most this many tries per player in a UTC day.
- **Guarantee.** Mark some items as rare and set "guarantee after N". After N tries in a row with nothing rare, the next try is drawn from the rare items only. The count starts over whenever a rare item is given, by luck or by the guarantee.
- **The draw** uses the server's secure random number source. A player's tries at one box take turns, so two requests at once cannot get past the daily limit or the guarantee.
- **Idempotency.** Send an `idempotencyKey` and a retry returns the same result without opening again.

Under **Mystery boxes**, each box lists what every item has really given next to its published chance, so you can check the two agree.

```ts
const boxes = await gami.me.boxes(); // the drop table, cost, tries left today
const result = await gami.me.openBox('daily_chest', { idempotencyKey: crypto.randomUUID() });
// { item: { name: '500 gems', rare: true }, prizes: [...], guaranteed: false }
```

Failures arrive as 409 with a `code`: `INSUFFICIENT_POINTS` or `LIMIT_REACHED`. A `box.opened` webhook is sent for every try.

> [!WARNING]
> A box paid for with a currency that people can buy with real money is treated as gambling in some countries, and app stores have their own rules for it. Keep paid boxes to points that are only earned, always show the odds, and check the rules where your players live. Gami.Fied publishes the odds and offers a guarantee, but it cannot decide what is lawful for your app.

## Season pass

A pass is a track of tiers that runs between two dates. Each tier needs an amount of **season XP**: the XP a player earned between the start and the end. XP from before the season does not count, and deductions during it count against it.

- **Two lanes.** Every tier can have a free reward and a premium reward. The premium lane is bought with a currency, or given by your server (for example after a real-money purchase) with `POST /v1/users/:userId/passes/:passKey/premium`.
- **Claiming.** Rewards are claimed, not pushed, so the player gets the moment of opening them. `POST /v1/me/passes/:passKey/claim` with a `tier` and a `lane` claims one reward; with an empty body it claims everything that is ready. Each reward is given once, even when several requests arrive together.
- **Buying premium late** opens the premium rewards of tiers already reached.
- **After the end**, rewards can be claimed for seven more days. XP earned in those days does not count.

Failures arrive as 409 with a `code`: `TIER_LOCKED`, `PREMIUM_REQUIRED`, `ALREADY_CLAIMED`, `PASS_NOT_STARTED`, `PASS_ENDED`, `NO_PREMIUM_LANE`, `PASS_NOT_ACTIVE` or `INSUFFICIENT_POINTS`.

A pass does not copy itself for the next season. Make a new pass with new dates; several can exist at once.

## Teams

A team is a named group that players join. A player is in one team at a time, and joining another leaves the first. A team can have a size limit, which holds when many players join at once.

- Players join with `POST /v1/me/team` and a write token. If you place players in teams yourself, use `POST /v1/users/:userId/team` from your server and give players read-only tokens.
- `GET /v1/me/teams` lists every team with its size and the XP its members hold together, highest first. It is both the list to join from and the team board.
- `GET /v1/me/team` returns the player's team, its place, and up to 50 members by name, picture and XP. It never returns another player's ID or email.

Teams are separate from segments. A segment is a filter over what you already know about a player, such as their country. A team is something a player chooses.

## Shared goals

A shared goal is one target that many players reach together.

| Scope | Meaning |
| --- | --- |
| Everyone (`community`) | One total for the whole project, such as a million lessons this month |
| Each team (`team`) | Every team has its own total and races to the target. Events from a player in no team do not count |

- **What counts.** Each event of the goal's type adds 1, or the value of a field such as `payload.distance` (rounded down; zero and negative values are ignored). Filters on the payload work as they do for challenges.
- **Once per event.** An event is counted once per goal however often the worker retries it.
- **When the target is reached**, counting stops for that total, a `goal.completed` webhook is sent, and everyone who contributed is paid the prizes, once each. For a team goal, only that team's contributors are paid. Large goals are paid in batches by the worker, so the last players may be paid a few minutes after the first.
- A goal can have a start and an end. A goal that ends before its target pays nothing.
- A goal cannot change between everyone and per team once it is made.

## Cosmetics

A cosmetic is a title, an avatar frame or a profile item. A player comes to own one in four ways:

- **A badge unlocks it.** Everyone who holds the achievement owns the cosmetic, including players who earned the badge before the cosmetic existed.
- **They buy it** with a currency.
- **They win it** as a prize from a box, a pass, a goal, a leaderboard place or a journey.
- **Your server gives it** with `POST /v1/users/:userId/cosmetics`.

A player wears one title and one frame at a time, and any number of items. Putting on a title takes the previous one off.

What a player wears is returned by `GET /v1/me` under `cosmetics`, and each row of `GET /v1/me/leaderboard` carries the player's `title` and `frameUrl`. The `LevelProgress` and `Leaderboard` components show the title.

## Leaderboard prizes

Plain leaderboards pay nothing when a period ends; only leagues move players up and down. A leaderboard prize pays a range of places on the **daily**, **weekly** or **monthly** board in XP, a currency, a badge or a cosmetic.

- Periods are in UTC, like the boards: a day from midnight, a week from Monday, a month from the 1st.
- The worker pays a period within about ten minutes of it ending, and sends a `leaderboard.prize_paid` webhook and a notification for each winner.
- A place is paid once per period. Running the payout again changes nothing.
- A prize covers periods that end **after it was made**. Making one on Tuesday does not pay last week.
- Deactivated players and players hidden from rankings are not on the board, so they are not paid. A player with no XP in the period is not paid either.
- A prize reaches down to place 100.
- Prize XP is written when it is paid, so it counts on the board of the period it is paid in.

`GET /v1/me/leaderboard/prizes` returns what is on offer and what the player has won.

## Journeys

A journey is a chain of challenges. A step does not count events until every step before it is finished, so the steps happen in order.

- A step is a challenge that **runs once**. Daily and weekly challenges cannot be steps, and a challenge can be in only one journey.
- An event that arrives while its step is locked is **not saved up**. If the player has to do it again after the step opens, say so in the step's description, or put the steps in the order people naturally do them.
- Each step still pays its own challenge rewards. Finishing the last step also pays the journey's prizes, once, and sends a `journey.completed` webhook.
- `GET /v1/me/journeys` returns each step with its progress and whether it is `locked`. `GET /v1/me/challenges` marks locked steps with `locked: true`.
- Turning a journey off, or deleting it, lets its challenges count on their own again.

## In React

`@gami.fied/react` has a component for each. See [React components](./react.md).

```tsx
<MysteryBox />      {/* open a box, with the odds */}
<SeasonPass />      {/* tiers, claim button, premium lane */}
<SharedGoals />     {/* progress of everyone or the team */}
<TeamCard />        {/* the player's team and its members */}
<JourneyPath />     {/* steps in order, with locks */}
<CosmeticLocker />  {/* owned, worn, and how to get the rest */}
```

`MysteryBox`, `SeasonPass` and `CosmeticLocker` have buttons that change things, so they need a token created with `access: 'write'`. With a read-only token they still show everything, and the buttons report the refusal.

## From your server

```ts
await gami.mechanics.openBox({ userId: 'user_123', boxKey: 'daily_chest', idempotencyKey: 'order-4821-box' });
await gami.mechanics.claimPass({ userId: 'user_123', passKey: 'season_1' }); // everything that is ready
await gami.mechanics.grantPremium({ userId: 'user_123', passKey: 'season_1' });
await gami.mechanics.setTeam({ userId: 'user_123', team: 'red' });
await gami.mechanics.grantCosmetic({ userId: 'user_123', cosmetic: 'night_owl' });
const goals = await gami.mechanics.userGoals({ userId: 'user_123' });
```

API keys need `rewards:*` for boxes, passes and cosmetics, `social:*` for teams, `challenges:*` for goals and journeys, and `leaderboard:read` for leaderboard prizes.

## Limits to know

- **Promote changes** (staging to production) does not copy these six yet. Use the organization export and import, which does, or make them again in production.
- **Changing team in the middle of a team goal.** What the player adds afterwards goes to the new team's total, but they are paid with the first team they contributed for on that goal.
- **A pass counts XP, not a currency.** There is no separate "pass points" balance.
- **Odds are per try.** There is no seeded or provably fair draw that a player can verify afterwards.
