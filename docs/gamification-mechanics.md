# Gamification mechanics

Your app sends events to Gami.Fied. Rules decide what each event earns, and rewards are recorded in the background.

For every field and response, see the API Docs page in the dashboard, or [`openapi.json`](./openapi.json).

---

## 1. Events

Send what happened to `POST /v1/events`:

```json
{
  "event": "lesson_completed",
  "user_id": "user_123",
  "payload": { "lessonId": "les_42", "score": 95, "category": "math" }
}
```

| Field | Required | Notes |
| :--- | :--- | :--- |
| `event` | Yes | Up to 128 characters. Rules match it exactly. |
| `user_id` | No | Your ID for the user. A new user is created the first time an ID is seen. |
| `payload` | No | Details of the event, up to 64 KB. Rule conditions can read it. |
| `occurred_at` | No | ISO 8601 UTC time. Defaults to now. |
| `idempotency_key` | No | Makes retries safe. See [Idempotency](./idempotency.md). |

The response confirms the event was received. Rewards are worked out afterwards:

```json
{ "id": "evt_1762421400000_u7i8o", "status": "accepted", "duplicate": false }
```

To include the rewards in the response, add `?wait=true`. It waits up to 5 seconds, and if `rewards.evaluated` is `false`, the rewards will still arrive later.

To send up to 100 events at once, use `POST /v1/events/batch`. Each event succeeds or fails on its own, and the response is `207` with a result for each one.

---

## 2. Rules

A rule has a trigger, optional conditions and one or more actions. The trigger is matched against the event name, and the rule then runs if its conditions pass.

```json
{
  "name": "High score bonus",
  "trigger": "lesson_completed",
  "conditions": {
    "all": [
      { "field": "payload.score", "operator": "greater_than_or_equal", "value": 90 },
      { "field": "payload.category", "operator": "equals", "value": "math" }
    ]
  },
  "actions": [
    { "type": "award_xp", "params": { "amount": 50 } },
    { "type": "award_achievement", "params": { "achievementKey": "math_star" } }
  ]
}
```

### Conditions

A condition's `field` is a dot path into the event, so details you sent are under `payload`, such as `payload.score`. Conditions can be grouped with `all`, `any` and `not`.

| Operator | Meaning |
| :--- | :--- |
| `equals`, `not_equals` | Exact match |
| `exists`, `not_exists` | The field is present or missing |
| `greater_than`, `greater_than_or_equal` | Number comparison |
| `less_than`, `less_than_or_equal` | Number comparison |
| `contains` | Text or list contains the value |
| `starts_with`, `ends_with` | Text match |
| `in`, `not_in` | The value is in a list |

### Actions

| Type | Params | What it does |
| :--- | :--- | :--- |
| `award_xp` | `amount` | Gives the user XP |
| `award_achievement` | `achievementKey` | Awards an achievement once |

The Rules page has a builder for all of this, a simulator for trying a rule against a sample event, and a trace showing why a rule did or didn't fire.

---

## 3. XP

- Every change is a row in `xp_ledger`, with an amount and a reason. XP History in the dashboard shows these.
- Each user's total is kept in `user_xp_balances`, so reading a balance is fast.
- A manual adjustment can add or remove XP, but can't take a balance below zero.

---

## 4. Levels

Levels aren't calculated from a formula. You define each one with a number, a name and the total XP it needs, and higher levels must need more XP. A user's level comes from comparing their total XP with the enabled levels.

Reaching a new level creates a `level_up` notification and a `level.up` webhook.

---

## 5. Achievements

An achievement has a unique key, a name, and an optional description and icon. It's awarded by a rule's `award_achievement` action or a challenge reward, and a user can only earn each one once. Awards are stored in `user_achievements`.

---

## 6. Challenges

A challenge counts events with a given name until it reaches a target, within optional start and end dates. For example, "Place 10 orders".

- Each event counts once per challenge, tracked in `challenge_event_progress`.
- Rewards are XP or an achievement, up to 10 per challenge.
- Rewards go through `challenge_reward_outbox`, so a crash can delay them but not lose or repeat them.

---

## 7. Leaderboards

- Rankings are calculated from PostgreSQL on each request, so they're always current. Large projects should test this, as no load test has been published yet.
- Periods are `all_time`, `daily`, `weekly` and `monthly`, using UTC.
- Only users with XP in the period are ranked, and deactivated users are hidden.
