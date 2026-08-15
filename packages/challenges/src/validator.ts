import { ChallengeInput, ChallengeReward } from './types.js';

export function validateChallengeInput(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: ChallengeInput;
} {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid JSON object'] };
  }

  const raw = input as Record<string, unknown>;

  // Check serialized size limit (16KB)
  try {
    const serialized = JSON.stringify(raw);
    if (serialized.length > 16384) {
      errors.push('Challenge payload size exceeds maximum limit of 16KB');
    }
  } catch {
    errors.push('Invalid JSON payload structure');
    return { valid: false, errors };
  }

  // Key validation
  const key = raw.key;
  if (typeof key !== 'string' || key.trim().length === 0 || key.length > 64) {
    errors.push('Key must be a non-empty string between 1 and 64 characters');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    errors.push('Key must contain only alphanumeric characters, underscores, or hyphens');
  }

  // Name validation
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 256) {
    errors.push('Name must be a non-empty string between 1 and 256 characters');
  }

  // Trigger validation
  const trigger = raw.trigger;
  if (typeof trigger !== 'string' || trigger.trim().length === 0 || trigger.length > 128) {
    errors.push('Trigger must be a non-empty string between 1 and 128 characters');
  }

  // Type validation
  const type = raw.type ?? 'counter';
  if (type !== 'counter') {
    errors.push(`Unsupported challenge type '${type}'. Only 'counter' is supported`);
  }

  // Target validation
  const target = raw.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || target <= 0) {
    errors.push('Target must be a positive integer greater than 0');
  }

  // Time Window validation
  let startAtDate: Date | null = null;
  let endAtDate: Date | null = null;

  if (raw.startAt !== undefined && raw.startAt !== null) {
    const parsed = new Date(raw.startAt as string | number);
    if (isNaN(parsed.getTime())) {
      errors.push('Invalid startAt timestamp format');
    } else {
      startAtDate = parsed;
    }
  }

  if (raw.endAt !== undefined && raw.endAt !== null) {
    const parsed = new Date(raw.endAt as string | number);
    if (isNaN(parsed.getTime())) {
      errors.push('Invalid endAt timestamp format');
    } else {
      endAtDate = parsed;
    }
  }

  if (startAtDate && endAtDate && endAtDate <= startAtDate) {
    errors.push('endAt must be strictly greater than startAt');
  }

  // Rewards validation
  const rewardsRaw = raw.rewards;
  const validatedRewards: ChallengeReward[] = [];

  if (!Array.isArray(rewardsRaw)) {
    errors.push('Rewards must be an array');
  } else if (rewardsRaw.length > 10) {
    errors.push('Maximum 10 rewards allowed per challenge');
  } else {
    for (let i = 0; i < rewardsRaw.length; i++) {
      const reward = rewardsRaw[i];
      if (!reward || typeof reward !== 'object') {
        errors.push(`Reward at index ${i} must be an object`);
        continue;
      }

      const rType = (reward as Record<string, unknown>).type;
      if (rType === 'xp') {
        const amount = (reward as Record<string, unknown>).amount;
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
          errors.push(`Reward at index ${i} (xp) must have a positive integer amount > 0`);
        } else {
          validatedRewards.push({ type: 'xp', amount });
        }
      } else if (rType === 'achievement') {
        const key = (reward as Record<string, unknown>).achievementKey;
        if (typeof key !== 'string' || key.trim().length === 0 || key.length > 64) {
          errors.push(
            `Reward at index ${i} (achievement) must have a valid achievementKey between 1 and 64 characters`
          );
        } else {
          validatedRewards.push({ type: 'achievement', achievementKey: key.trim() });
        }
      } else {
        errors.push(
          `Reward at index ${i} has unsupported type '${rType}'. Only 'xp' and 'achievement' are supported`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitized: ChallengeInput = {
    key: (key as string).trim(),
    name: (name as string).trim(),
    description: typeof raw.description === 'string' ? raw.description.trim() : null,
    iconUrl: typeof raw.iconUrl === 'string' ? raw.iconUrl.trim() : null,
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
    trigger: (trigger as string).trim(),
    type: 'counter',
    target: target as number,
    startAt: startAtDate,
    endAt: endAtDate,
    rewards: validatedRewards,
  };

  return { valid: true, errors: [], sanitized };
}
