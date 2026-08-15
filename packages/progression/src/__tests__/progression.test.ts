import { describe, expect, it } from 'vitest';
import { calculateLevel, getLevelsCrossed } from '../calculator.js';
import { getDefaultLevelDefinitions } from '../defaults.js';
import { validateLevelDefinitions } from '../validator.js';

describe('@gami/progression - Validation & Calculation Unit Suite', () => {
  const defaultLevels = getDefaultLevelDefinitions('test-proj');

  describe('Level Definition Validation', () => {
    it('validates a correct sequential level configuration', () => {
      const res = validateLevelDefinitions(defaultLevels);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects missing Level 1', () => {
      const invalid = [
        { level: 2, name: 'L2', requiredXp: 100 },
        { level: 3, name: 'L3', requiredXp: 250 },
      ];
      const res = validateLevelDefinitions(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Levels must be sequential');
    });

    it('rejects Level 1 requiring non-zero XP', () => {
      const invalid = [
        { level: 1, name: 'L1', requiredXp: 50 },
        { level: 2, name: 'L2', requiredXp: 100 },
      ];
      const res = validateLevelDefinitions(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Level 1 must require 0 XP');
    });

    it('rejects non-monotonic XP requirements', () => {
      const invalid = [
        { level: 1, name: 'L1', requiredXp: 0 },
        { level: 2, name: 'L2', requiredXp: 500 },
        { level: 3, name: 'L3', requiredXp: 250 },
      ];
      const res = validateLevelDefinitions(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Required XP must strictly monotonically increase');
    });

    it('rejects duplicate level numbers', () => {
      const invalid = [
        { level: 1, name: 'L1', requiredXp: 0 },
        { level: 2, name: 'L2', requiredXp: 100 },
        { level: 2, name: 'L2-dup', requiredXp: 200 },
      ];
      const res = validateLevelDefinitions(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Duplicate level number');
    });
  });

  describe('Level Progression Calculation', () => {
    it('calculates Level 1 for 0 XP', () => {
      const res = calculateLevel(0, defaultLevels);
      expect(res.level).toBe(1);
      expect(res.name).toBe('Novice');
      expect(res.currentXp).toBe(0);
      expect(res.levelRequiredXp).toBe(0);
      expect(res.nextLevelXp).toBe(100);
      expect(res.xpIntoLevel).toBe(0);
      expect(res.xpToNextLevel).toBe(100);
      expect(res.progressPercent).toBe(0);
      expect(res.isMaxLevel).toBe(false);
    });

    it('calculates mid-level progress (320 XP = Level 3)', () => {
      const res = calculateLevel(320, defaultLevels);
      expect(res.level).toBe(3); // Level 3 starts at 250, Level 4 starts at 500
      expect(res.name).toBe('Achiever');
      expect(res.currentXp).toBe(320);
      expect(res.levelRequiredXp).toBe(250);
      expect(res.nextLevelXp).toBe(500);
      expect(res.xpIntoLevel).toBe(70);
      expect(res.xpToNextLevel).toBe(180);
      expect(res.progressPercent).toBe(28);
      expect(res.isMaxLevel).toBe(false);
    });

    it('calculates exact threshold progression (100 XP = Level 2)', () => {
      const res = calculateLevel(100, defaultLevels);
      expect(res.level).toBe(2);
      expect(res.xpIntoLevel).toBe(0);
      expect(res.xpToNextLevel).toBe(150);
      expect(res.progressPercent).toBe(0);
    });

    it('handles exact maximum level (1000 XP = Level 5)', () => {
      const res = calculateLevel(1000, defaultLevels);
      expect(res.level).toBe(5);
      expect(res.name).toBe('Legend');
      expect(res.isMaxLevel).toBe(true);
      expect(res.nextLevelXp).toBeNull();
      expect(res.xpToNextLevel).toBe(0);
      expect(res.progressPercent).toBe(100);
    });

    it('handles above maximum level (5000 XP = Level 5 max level)', () => {
      const res = calculateLevel(5000, defaultLevels);
      expect(res.level).toBe(5);
      expect(res.isMaxLevel).toBe(true);
      expect(res.progressPercent).toBe(100);
      expect(res.xpIntoLevel).toBe(4000);
    });
  });

  describe('Level Crossing Detection', () => {
    it('returns empty array when XP does not cross level threshold (0 -> 50)', () => {
      const crossed = getLevelsCrossed(0, 50, defaultLevels);
      expect(crossed).toHaveLength(0);
    });

    it('returns crossed level when jumping from 90 -> 200 (Level 1 -> Level 2)', () => {
      const crossed = getLevelsCrossed(90, 200, defaultLevels);
      expect(crossed).toEqual([2]);
    });

    it('returns multiple crossed levels when jumping 90 -> 290 (Level 1 -> Level 3)', () => {
      const crossed = getLevelsCrossed(90, 290, defaultLevels);
      expect(crossed).toEqual([2, 3]);
    });

    it('returns level 5 when jumping from 500 -> 1000', () => {
      const crossed = getLevelsCrossed(500, 1000, defaultLevels);
      expect(crossed).toEqual([5]);
    });
  });
});
