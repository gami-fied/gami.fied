import { describe, expect, it } from 'vitest';
import { evaluateChallenge } from '../engine.js';
import { ChallengeDefinition } from '../types.js';
import { validateChallengeInput } from '../validator.js';

describe('@gami/challenges - Unit Test Suite', () => {
  const baseChallenge: ChallengeDefinition = {
    id: 'ch_1',
    projectId: 'prj_1',
    key: 'play_10_games',
    name: 'Play 10 Games',
    description: 'Complete 10 games',
    iconUrl: null,
    enabled: true,
    trigger: 'game.completed',
    type: 'counter',
    target: 10,
    startAt: null,
    endAt: null,
    rewards: [{ type: 'xp', amount: 500 }],
  };

  it('1. Validates a correct challenge definition', () => {
    const res = validateChallengeInput({
      key: 'play_10_games',
      name: 'Play 10 Games',
      trigger: 'game.completed',
      target: 10,
      rewards: [
        { type: 'xp', amount: 500 },
        { type: 'achievement', achievementKey: 'challenge_master' },
      ],
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.sanitized?.key).toBe('play_10_games');
  });

  it('2. Rejects invalid challenge definitions (invalid key, target <= 0, bad dates, invalid rewards)', () => {
    const resKey = validateChallengeInput({
      key: 'invalid key!',
      name: 'Name',
      trigger: 'evt',
      target: 5,
      rewards: [],
    });
    expect(resKey.valid).toBe(false);

    const resTarget = validateChallengeInput({
      key: 'key',
      name: 'Name',
      trigger: 'evt',
      target: 0,
      rewards: [],
    });
    expect(resTarget.valid).toBe(false);

    const resDates = validateChallengeInput({
      key: 'key',
      name: 'Name',
      trigger: 'evt',
      target: 5,
      startAt: '2026-10-02',
      endAt: '2026-10-01',
      rewards: [],
    });
    expect(resDates.valid).toBe(false);

    const resRewards = validateChallengeInput({
      key: 'key',
      name: 'Name',
      trigger: 'evt',
      target: 5,
      rewards: [{ type: 'unknown', amount: 10 }],
    });
    expect(resRewards.valid).toBe(false);
  });

  it('3. Trigger matching: matching event increments progress', () => {
    const res = evaluateChallenge(baseChallenge, { event: 'game.completed' }, null);
    expect(res.progressed).toBe(true);
    expect(res.newProgress).toBe(1);
    expect(res.completed).toBe(false);
  });

  it('4. Non-matching events do not progress', () => {
    const res = evaluateChallenge(baseChallenge, { event: 'user.login' }, null);
    expect(res.progressed).toBe(false);
    expect(res.newProgress).toBe(0);
    expect(res.reason).toBe('Event trigger does not match challenge trigger');
  });

  it('5. Progress increment: +1 on each matching event', () => {
    const res = evaluateChallenge(
      baseChallenge,
      { event: 'game.completed' },
      {
        id: 'p1',
        projectId: 'prj_1',
        userId: 'usr_1',
        challengeId: 'ch_1',
        progress: 7,
        completed: false,
        completedAt: null,
      }
    );
    expect(res.progressed).toBe(true);
    expect(res.newProgress).toBe(8);
    expect(res.completed).toBe(false);
  });

  it('6. Progress clamping: progress never exceeds target', () => {
    const res = evaluateChallenge(
      baseChallenge,
      { event: 'game.completed' },
      {
        id: 'p1',
        projectId: 'prj_1',
        userId: 'usr_1',
        challengeId: 'ch_1',
        progress: 9,
        completed: false,
        completedAt: null,
      }
    );
    expect(res.progressed).toBe(true);
    expect(res.newProgress).toBe(10);
    expect(res.completed).toBe(true);
    expect(res.newlyCompleted).toBe(true);
  });

  it('7. Completion detection: newlyCompleted is true when target is hit', () => {
    const ch3: ChallengeDefinition = { ...baseChallenge, target: 3 };
    const res = evaluateChallenge(
      ch3,
      { event: 'game.completed' },
      {
        id: 'p1',
        projectId: 'prj_1',
        userId: 'usr_1',
        challengeId: 'ch_1',
        progress: 2,
        completed: false,
        completedAt: null,
      }
    );
    expect(res.completed).toBe(true);
    expect(res.newlyCompleted).toBe(true);
  });

  it('8. Disabled challenges do not progress', () => {
    const disabledCh = { ...baseChallenge, enabled: false };
    const res = evaluateChallenge(disabledCh, { event: 'game.completed' }, null);
    expect(res.progressed).toBe(false);
    expect(res.reason).toBe('Challenge is disabled');
  });

  it('9. Future challenges (startAt in future) do not progress', () => {
    const futureCh = {
      ...baseChallenge,
      startAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    const res = evaluateChallenge(
      futureCh,
      { event: 'game.completed' },
      null,
      new Date('2026-08-14T00:00:00.000Z')
    );
    expect(res.progressed).toBe(false);
    expect(res.reason).toBe('Challenge has not started yet');
  });

  it('10. Expired challenges (endAt in past) do not progress', () => {
    const expiredCh = {
      ...baseChallenge,
      endAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    const res = evaluateChallenge(
      expiredCh,
      { event: 'game.completed' },
      null,
      new Date('2026-08-14T00:00:00.000Z')
    );
    expect(res.progressed).toBe(false);
    expect(res.reason).toBe('Challenge has expired');
  });

  it('11. Already completed challenges do not progress again', () => {
    const res = evaluateChallenge(
      baseChallenge,
      { event: 'game.completed' },
      {
        id: 'p1',
        projectId: 'prj_1',
        userId: 'usr_1',
        challengeId: 'ch_1',
        progress: 10,
        completed: true,
        completedAt: new Date(),
      }
    );
    expect(res.progressed).toBe(false);
    expect(res.completed).toBe(true);
    expect(res.newlyCompleted).toBe(false);
    expect(res.reason).toBe('Challenge is already completed');
  });

  it('12. Reward validation: rejects XP <= 0 and invalid achievement keys', () => {
    const resXp = validateChallengeInput({
      key: 'k',
      name: 'N',
      trigger: 't',
      target: 1,
      rewards: [{ type: 'xp', amount: -50 }],
    });
    expect(resXp.valid).toBe(false);

    const resAch = validateChallengeInput({
      key: 'k',
      name: 'N',
      trigger: 't',
      target: 1,
      rewards: [{ type: 'achievement', achievementKey: '' }],
    });
    expect(resAch.valid).toBe(false);
  });
});
