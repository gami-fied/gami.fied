# Leaderboards API Guide (`gami.leaderboards`)

Query deterministic leaderboard rankings across `all_time`, `daily`, `weekly`, and `monthly` time windows.

---

## 1. List Leaderboard Rankings (`gami.leaderboards.list`)

```typescript
const lb = await gami.leaderboards.list({
  projectId: 'prj_123',
  period: 'weekly', // 'all_time' | 'daily' | 'weekly' | 'monthly'
  page: 1,
  limit: 25,
});

console.log(`Weekly Leaderboard (${lb.total} participants):`);
lb.entries.forEach((e) => {
  console.log(`#${e.rank} User ${e.externalId || e.userId}: ${e.totalXp} XP`);
});
```

---

## 2. Get Specific User Rank (`gami.leaderboards.getUserRank`)

```typescript
const rankInfo = await gami.leaderboards.getUserRank({
  projectId: 'prj_123',
  userId: 'usr_101',
  period: 'all_time',
});

console.log(
  `Rank: #${rankInfo.rank} out of ${rankInfo.totalParticipants} users (${rankInfo.totalXp} XP)`
);
```
