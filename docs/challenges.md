# Challenges & Quests API Guide (`gami.challenges`)

Track user active challenges, quests, completion status, and rewards.

---

## 1. List Project Challenges (`gami.challenges.list`)

```typescript
const challenges = await gami.challenges.list({
  projectId: 'prj_123',
});

challenges.forEach((ch) => {
  console.log(`[${ch.key}] ${ch.name}: Target ${ch.targetCount}`);
});
```

---

## 2. List User Challenge Progress (`gami.challenges.listForUser`)

```typescript
const userChallenges = await gami.challenges.listForUser({
  projectId: 'prj_123',
  userId: 'usr_101',
});

userChallenges.forEach((uc) => {
  console.log(
    `Challenge ${uc.challenge?.name}: ${uc.currentCount}/${uc.targetCount} (${uc.completed ? 'COMPLETED' : 'IN PROGRESS'})`
  );
});
```
