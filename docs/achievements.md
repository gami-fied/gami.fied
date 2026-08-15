# Achievements API Guide (`gami.achievements`)

Query achievement configurations and user unlocks.

---

## 1. List Project Achievements (`gami.achievements.list`)

```typescript
const achievements = await gami.achievements.list({
  projectId: 'prj_123',
});

achievements.forEach((ach) => {
  console.log(`[${ach.key}] ${ach.name}: ${ach.description}`);
});
```

---

## 2. List Unlocked User Achievements (`gami.achievements.listForUser`)

```typescript
const userAchievements = await gami.achievements.listForUser({
  projectId: 'prj_123',
  userId: 'usr_101',
});

console.log(`Unlocked Achievements: ${userAchievements.length}`);
```

---

## 3. Achievement Summary Analytics (`gami.achievements.summary`)

```typescript
const summary = await gami.achievements.summary({
  projectId: 'prj_123',
});

console.log(`Total Configured: ${summary.totalAchievements}`);
console.log(`Total Times Unlocked: ${summary.totalUnlockedCount}`);
```
