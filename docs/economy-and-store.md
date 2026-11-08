# Economy, store and safe rule changes

This page covers the tools for running a points economy: giving more XP for a while, keeping rewards from being farmed, letting people spend points, and changing rules without breaking things.

## Boosts

A boost multiplies the XP that **rules** give. Manual adjustments, challenge rewards and tier bonuses are left alone.

- Pick a multiplier from 0.1 to 10. `2` doubles XP.
- Limit it by start and end time, days of the week, hours of the day (with a time zone), and event types.
- If several apply at once, the strongest one wins. They do not stack.
- The time of the event decides, so a late or replayed event keeps the value it would have had.

Manage boosts under **Boosts & limits** in the dashboard, or `GET/POST /api/projects/:projectId/boosts`.

## Limits and shadow bans

A limit holds rule XP back once it reaches a ceiling. It is applied after any boost.

| Kind | Meaning |
| --- | --- |
| `xp_cap` | At most this much XP per day, week or month |
| `award_cap` | At most this many awards per day, week or month |
| `cooldown` | At least this many seconds between awards |

A cap gives whatever room is left, then nothing. Every time a limit holds XP back it is recorded under **Blocked XP**, with what the rule wanted and what was given. People who keep appearing there may be gaming a rule.

**Hide from rankings** (on the user's page, or from Blocked XP) removes a person from every leaderboard while they carry on playing and earning. Nothing tells them, so there is nothing to work around.

## Backtests

Before you publish a rule, open **Test against past events** on it. The rule is run over events you already stored, in a dry run that writes nothing, and the result shows who it would have rewarded, how much XP, and how that compares with the XP you really gave in the same period. Use it to spot a rule that would double your XP supply.

`POST /api/projects/:projectId/rules/simulate` takes a rule definition (or a rule ID) and a window.

## Drafts, publishing and history

Editing a live rule can save as a **draft**: the live rule keeps running while you work, and **Publish** swaps the draft in. Every change to a live rule is stored as a version, so **History** can show what changed and when, and **Roll back** restores an earlier version as a new one. Rollback never rewrites history.

## Currencies and wallets

XP is for ranking. A **currency** is a separate kind of point people can save and spend, such as Coins or Gems. Create them on the **Store** page.

- Give a currency out with the **Give currency** rule action, or by hand on a user's **Wallet** tab.
- A currency can expire points a number of days after they are earned. Changing the expiry affects points earned from then on.
- Spending uses the points that expire soonest first. A balance never goes below zero, and expired points are written off to the history by the worker.
- Three days before points expire, their owner gets a `points_expiring` notification (in the app, and by email if they get emails), once per batch of points.
- Every change is a row in the history, with the reason, so a balance can always be explained.

`award_currency` in a rule takes `{ "currency": "coins", "amount": 25 }`. It runs once per rule run, even if the event is retried.

## Rewards

A reward has a price in one currency, optional stock, an optional limit per person, and a kind:

- **You deliver it.** A purchase waits under **Purchases**. A `reward.redeemed` webhook tells your systems. Mark it delivered when done, or cancel it to refund.
- **Hands out a code from a list.** Paste a pool of codes. Each purchase gets one, and is delivered at once. When the codes run out the reward cannot be bought.
- **Makes a unique coupon code.** Each purchase gets a fresh code, your prefix followed by 10 random letters and digits, such as `COFFEE-7H2KQX9M4P`. It never runs out; your shop accepts the codes it receives in the `reward.redeemed` webhook.

Buying happens in one step: the points, the stock, the person's limit and the code change together or not at all. Two people cannot take the last item, and one person cannot spend the same points twice at once.

Cancelling a waiting purchase gives the points back, puts the stock back and frees the code. A delivered purchase cannot be cancelled. A `reward.cancelled` webhook is sent.

A reward that has been bought can only be switched off, not deleted, so history stays whole.

### Failures to handle

Buying returns `409` with a `code`:

| Code | Meaning |
| --- | --- |
| `INSUFFICIENT_POINTS` | Not enough points |
| `OUT_OF_STOCK` | None left |
| `OUT_OF_CODES` | A code reward has no codes left |
| `LIMIT_REACHED` | This person has bought the most they may |

Send an `idempotencyKey` so a retry after a network error does not buy twice. A repeat returns the first purchase with `duplicate: true`.

### From your code

```ts
// In the browser, with an end-user token
const { data: store } = await gami.me.store(); // cheapest first, with `affordable` and `inStock`
const purchase = await gami.me.redeem('free_coffee', { idempotencyKey: crypto.randomUUID() });

// From your server
await gami.store.redeem({ userId: 'user_123', rewardKey: 'free_coffee', idempotencyKey: 'order-4821' });
```

API keys need `wallets:read` to read balances, `rewards:read` to list rewards and `rewards:write` to buy.
