import { describe, expect, it } from 'vitest';
import { generateNotificationText } from '../templates.js';
import { generateChallengeCompletionSourceId, generateLevelUpSourceId } from '../service.js';

describe('Notification Templates & Helper Unit Tests', () => {
  it('generates correct text for XP Awarded', () => {
    const text1 = generateNotificationText('xp_awarded', { amount: 500 });
    expect(text1.title).toBe('XP Awarded');
    expect(text1.message).toBe('You earned 500 XP!');

    const text2 = generateNotificationText('xp_awarded', {
      amount: 150,
      reason: 'Daily Quiz',
    });
    expect(text2.message).toBe('You earned 150 XP for Daily Quiz!');
  });

  it('generates correct text for Achievement Unlocked', () => {
    const text = generateNotificationText('achievement_unlocked', {
      achievementId: 'ach_1',
      achievementKey: 'first_login',
      achievementName: 'First Victory',
    });
    expect(text.title).toBe('Achievement Unlocked!');
    expect(text.message).toBe('Achievement unlocked: First Victory');
  });

  it('generates correct text for Level Up', () => {
    const text = generateNotificationText('level_up', {
      previousLevel: 4,
      newLevel: 5,
      levelName: 'Master Veteran',
    });
    expect(text.title).toBe('Level Up!');
    expect(text.message).toBe('Congratulations! You reached Level 5 (Master Veteran).');
  });

  it('generates correct text for Challenge Completed', () => {
    const text = generateNotificationText('challenge_completed', {
      challengeId: 'ch_101',
      challengeKey: 'weekend_warrior',
      challengeName: 'Weekend Warrior',
    });
    expect(text.title).toBe('Challenge Completed!');
    expect(text.message).toBe('Challenge completed: Weekend Warrior');
  });

  it('generates deterministic source IDs for level ups and challenge completions', () => {
    const levelSourceId = generateLevelUpSourceId('proj_1', 'usr_1', 10);
    expect(levelSourceId).toBe('proj_1:usr_1:10');

    const challengeSourceId = generateChallengeCompletionSourceId('proj_1', 'usr_1', 'ch_5');
    expect(challengeSourceId).toBe('proj_1:usr_1:ch_5:completed');
  });
});
