# Levels & Progression API Guide (`gami.levels`)

Track user level progression, required XP thresholds, and tier status.

---

## 1. Get User Progress (`gami.levels.getUserProgress`)

```typescript
const progress = await gami.levels.getUserProgress({
  projectId: 'prj_123',
  userId: 'usr_101',
});

console.log(`Level: ${progress.currentLevel} (${progress.levelName})`);
console.log(`Current XP: ${progress.currentXp} / ${progress.requiredXp}`);
console.log(`Progress into level: ${progress.progressPercent}%`);
console.log(`XP needed for next level: ${progress.xpToNextLevel}`);
```

---

## 2. List Configured Level Tiers (`gami.levels.list`)

```typescript
const levels = await gami.levels.list({
  projectId: 'prj_123',
});

levels.forEach((lvl) => {
  console.log(`Level ${lvl.level}: ${lvl.name} (Requires ${lvl.requiredXp} XP)`);
});
```
