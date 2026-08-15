import { LevelDefinitionInput, LevelValidationResult } from './types.js';

export function validateLevelDefinitions(levels: LevelDefinitionInput[]): LevelValidationResult {
  const errors: string[] = [];

  if (!levels || levels.length === 0) {
    return { valid: false, errors: ['At least one level definition is required'] };
  }

  // Filter out soft-disabled levels for progression sequence checks
  const activeLevels = levels.filter((l) => l.enabled !== false).sort((a, b) => a.level - b.level);

  if (activeLevels.length === 0) {
    return { valid: false, errors: ['At least one enabled level definition is required'] };
  }

  const levelNumbers = new Set<number>();
  const xpThresholds = new Set<string>();

  for (const l of activeLevels) {
    if (!Number.isInteger(l.level) || l.level < 1) {
      errors.push(`Level number ${l.level} must be a positive integer >= 1`);
    }

    const xpBig = BigInt(l.requiredXp);
    if (xpBig < 0n) {
      errors.push(`Required XP for level ${l.level} must be non-negative >= 0`);
    }

    if (!l.name || l.name.trim().length === 0 || l.name.length > 64) {
      errors.push(`Level ${l.level} name must be between 1 and 64 characters`);
    }

    if (levelNumbers.has(l.level)) {
      errors.push(`Duplicate level number ${l.level} detected`);
    }
    levelNumbers.add(l.level);

    const xpKey = xpBig.toString();
    if (xpThresholds.has(xpKey)) {
      errors.push(`Duplicate required XP threshold ${xpKey} detected`);
    }
    xpThresholds.add(xpKey);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Enforce sequential numbers 1, 2, 3, 4...
  for (let i = 0; i < activeLevels.length; i++) {
    const item = activeLevels[i];
    if (!item) continue;
    const expectedLevel = i + 1;
    if (item.level !== expectedLevel) {
      errors.push(
        `Levels must be sequential 1, 2, 3... Expected level ${expectedLevel} but got ${item.level}`
      );
      break;
    }
  }

  // Level 1 must require 0 XP
  const firstLevel = activeLevels[0];
  if (firstLevel && BigInt(firstLevel.requiredXp) !== 0n) {
    errors.push(`Level 1 must require 0 XP, got ${firstLevel.requiredXp}`);
  }

  // Monotonic increase check
  for (let i = 0; i < activeLevels.length - 1; i++) {
    const curr = activeLevels[i];
    const next = activeLevels[i + 1];
    if (!curr || !next) continue;

    const currentXp = BigInt(curr.requiredXp);
    const nextXp = BigInt(next.requiredXp);
    if (nextXp <= currentXp) {
      errors.push(
        `Required XP must strictly monotonically increase. Level ${next.level} (${nextXp}) must be greater than Level ${curr.level} (${currentXp})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
