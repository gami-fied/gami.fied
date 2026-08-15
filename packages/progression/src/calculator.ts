import { LevelDefinitionInput, ProgressionResult } from './types.js';

export function calculateLevel(
  xpInput: number | bigint,
  levelsInput: LevelDefinitionInput[]
): ProgressionResult {
  const currentXpBig = BigInt(xpInput < 0 ? 0 : xpInput);
  const currentXpNum = Number(currentXpBig);

  const activeLevels = levelsInput
    .filter((l) => l.enabled !== false)
    .sort((a, b) => a.level - b.level);

  if (activeLevels.length === 0) {
    throw new Error('No active level definitions provided for level calculation');
  }

  // Find the active level (highest level where requiredXp <= currentXp)
  let activeIndex = 0;
  for (let i = 0; i < activeLevels.length; i++) {
    const item = activeLevels[i];
    if (!item) continue;
    const requiredXp = BigInt(item.requiredXp);
    if (currentXpBig >= requiredXp) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const currentLevelDef = activeLevels[activeIndex] || activeLevels[0];
  if (!currentLevelDef) {
    throw new Error('Active level definition could not be resolved');
  }

  const isMaxLevel = activeIndex === activeLevels.length - 1;
  const currentLevelRequiredXpBig = BigInt(currentLevelDef.requiredXp);

  if (isMaxLevel) {
    return {
      level: currentLevelDef.level,
      name: currentLevelDef.name,
      currentXp: currentXpNum,
      levelRequiredXp: Number(currentLevelRequiredXpBig),
      nextLevelXp: null,
      xpIntoLevel: Number(currentXpBig - currentLevelRequiredXpBig),
      xpToNextLevel: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const nextLevelDef = activeLevels[activeIndex + 1];
  if (!nextLevelDef) {
    return {
      level: currentLevelDef.level,
      name: currentLevelDef.name,
      currentXp: currentXpNum,
      levelRequiredXp: Number(currentLevelRequiredXpBig),
      nextLevelXp: null,
      xpIntoLevel: Number(currentXpBig - currentLevelRequiredXpBig),
      xpToNextLevel: 0,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const nextLevelRequiredXpBig = BigInt(nextLevelDef.requiredXp);

  const xpIntoLevelBig = currentXpBig - currentLevelRequiredXpBig;
  const xpToNextLevelBig = nextLevelRequiredXpBig - currentXpBig;
  const totalXpInLevelRangeBig = nextLevelRequiredXpBig - currentLevelRequiredXpBig;

  let progressPercent = 0;
  if (totalXpInLevelRangeBig > 0n) {
    const percentBig = (xpIntoLevelBig * 100n) / totalXpInLevelRangeBig;
    progressPercent = Math.min(100, Math.max(0, Number(percentBig)));
  }

  return {
    level: currentLevelDef.level,
    name: currentLevelDef.name,
    currentXp: currentXpNum,
    levelRequiredXp: Number(currentLevelRequiredXpBig),
    nextLevelXp: Number(nextLevelRequiredXpBig),
    xpIntoLevel: Number(xpIntoLevelBig),
    xpToNextLevel: Number(xpToNextLevelBig),
    progressPercent,
    isMaxLevel: false,
  };
}

export function getLevelsCrossed(
  previousXpInput: number | bigint,
  newXpInput: number | bigint,
  levelsInput: LevelDefinitionInput[]
): number[] {
  const prevXpBig = BigInt(previousXpInput < 0 ? 0 : previousXpInput);
  const newXpBig = BigInt(newXpInput < 0 ? 0 : newXpInput);

  if (newXpBig <= prevXpBig) {
    return [];
  }

  const prevRes = calculateLevel(prevXpBig, levelsInput);
  const newRes = calculateLevel(newXpBig, levelsInput);

  if (newRes.level <= prevRes.level) {
    return [];
  }

  const crossed: number[] = [];
  for (let lvl = prevRes.level + 1; lvl <= newRes.level; lvl++) {
    crossed.push(lvl);
  }

  return crossed;
}
