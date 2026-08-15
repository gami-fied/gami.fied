import { ChallengeDefinition, ChallengeEvaluationResult, ChallengeProgress } from './types.js';

export function evaluateChallenge(
  challenge: ChallengeDefinition,
  event: { event: string; timestamp?: Date },
  currentProgress?: ChallengeProgress | null,
  now: Date = new Date()
): ChallengeEvaluationResult {
  // 1. Check enabled state
  if (!challenge.enabled) {
    return {
      progressed: false,
      completed: currentProgress?.completed || false,
      newlyCompleted: false,
      newProgress: currentProgress?.progress || 0,
      target: challenge.target,
      reason: 'Challenge is disabled',
    };
  }

  // 2. Check time window bounds
  if (challenge.startAt) {
    const start = new Date(challenge.startAt);
    if (now < start) {
      return {
        progressed: false,
        completed: currentProgress?.completed || false,
        newlyCompleted: false,
        newProgress: currentProgress?.progress || 0,
        target: challenge.target,
        reason: 'Challenge has not started yet',
      };
    }
  }

  if (challenge.endAt) {
    const end = new Date(challenge.endAt);
    if (now >= end) {
      return {
        progressed: false,
        completed: currentProgress?.completed || false,
        newlyCompleted: false,
        newProgress: currentProgress?.progress || 0,
        target: challenge.target,
        reason: 'Challenge has expired',
      };
    }
  }

  // 3. Check trigger match
  if (event.event !== challenge.trigger) {
    return {
      progressed: false,
      completed: currentProgress?.completed || false,
      newlyCompleted: false,
      newProgress: currentProgress?.progress || 0,
      target: challenge.target,
      reason: 'Event trigger does not match challenge trigger',
    };
  }

  // 4. Check if already completed
  if (currentProgress?.completed) {
    return {
      progressed: false,
      completed: true,
      newlyCompleted: false,
      newProgress: challenge.target,
      target: challenge.target,
      reason: 'Challenge is already completed',
    };
  }

  // 5. Counter semantics: +1 progress clamped at target
  const currentP = currentProgress?.progress || 0;
  const newProgress = Math.min(currentP + 1, challenge.target);
  const completed = newProgress >= challenge.target;
  const newlyCompleted = completed && !(currentProgress?.completed || false);

  return {
    progressed: true,
    completed,
    newlyCompleted,
    newProgress,
    target: challenge.target,
  };
}
