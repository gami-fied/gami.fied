# Gamification Mechanics & Rules Engine

Gami provides a complete suite of gamification mechanics powered by an event-driven rules evaluation engine.

---

## 1. Event Ingestion API

Applications send user activities as structured event payloads to `POST /api/events`.

### Request Payload

```json
{
  "userId": "usr_1001",
  "eventType": "lesson_completed",
  "data": {
    "lessonId": "les_42",
    "score": 95,
    "category": "math"
  }
}
```

### Response

```json
{
  "eventId": "evt_883a9f1",
  "status": "ingested",
  "timestamp": "2026-08-16T12:00:00.000Z"
}
```

---

## 2. Event Rules Evaluation Engine

Rules listen for specific `eventType` triggers and evaluate custom conditions against event `data`.

### Rule Condition Operators

| Operator | Description | Example |
| :--- | :--- | :--- |
| `equals` | Exact match | `{ "field": "category", "operator": "equals", "value": "math" }` |
| `greater_than` | Greater than numeric value | `{ "field": "score", "operator": "greater_than", "value": 80 }` |
| `contains` | Substring or array inclusion | `{ "field": "tags", "operator": "contains", "value": "featured" }` |

### Rule Actions
When conditions pass, rules execute actions:
- **`award_xp`**: Grant an amount of XP to the user.
- **`unlock_achievement`**: Unlock an achievement for the user.
- **`increment_challenge`**: Advance progress on active quests/challenges.

---

## 3. XP & Points Balances

- **Immutable Ledger**: Every XP transaction creates an append-only entry in `xp_ledger` (`sourceType`, `sourceId`, `amount`).
- **Cached Balance**: User total XP balances are cached in `user_xp_balances` for instantaneous lookup performance.

---

## 4. Level Progression Curves

Gami automatically calculates user levels from total XP using configured level curves:

- **Level Curve Formulas**:
  - `linear`: `XP = level * baseXP`
  - `exponential`: `XP = baseXP * (level ^ multiplier)`
- Level ups emit `level_up` notification events and webhook events (`user.level_up`).

---

## 5. Achievements & Badges

- **Criteria Evaluation**: Achievements unlock when criteria conditions match or total required XP is accumulated.
- **Badges**: Achievements store badge image URLs and metadata.
- **Unlocks**: Tracked in `user_achievements` table (`unlockedAt`).

---

## 6. Quests & Challenges

Multi-step challenges require users to complete progress goals before expiration.

- **Progress Deduplication**: `challenge_event_progress` guarantees events are counted at most once per challenge.
- **Reward Outbox Pattern**: Upon completion, rewards (XP, Badges) are committed to `challenge_reward_outbox` for idempotent asynchronous execution.

---

## 7. Leaderboards

- **Real-Time Scoring**: Powered by Redis Sorted Sets (`ZADD`, `ZREVRANGE`) with fallback to PostgreSQL.
- **Time Windows**: Supports `all_time`, `monthly`, `weekly`, and `daily` timeframe filters.
- **Rank Lookups**: Fast lookup for user rank (`ZREVRANK`), score, and neighbor ranks.
