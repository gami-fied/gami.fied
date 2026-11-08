import { MAX_FILTERS, MAX_STEPS } from './steps.js';
import { ChallengeFilter, ChallengeInput, ChallengeReward, ChallengeStep } from './types.js';

const FILTER_OPERATORS = new Set([
  'equals',
  'not_equals',
  'exists',
  'not_exists',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
]);

function checkFilters(value: unknown, label: string, errors: string[]): ChallengeFilter[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list`);
    return null;
  }
  if (value.length > MAX_FILTERS) {
    errors.push(`${label} can have at most ${MAX_FILTERS} conditions`);
    return null;
  }
  const clean: ChallengeFilter[] = [];
  value.forEach((item, index) => {
    const filter = item as Record<string, unknown>;
    if (!filter || typeof filter !== 'object' || typeof filter.field !== 'string' || !/^(payload|userId|type)(\.[A-Za-z0-9_-]+)*$/.test(filter.field)) {
      errors.push(`${label} condition ${index + 1} needs a field such as "payload.score"`);
      return;
    }
    if (typeof filter.operator !== 'string' || !FILTER_OPERATORS.has(filter.operator)) {
      errors.push(`${label} condition ${index + 1} has an unsupported operator`);
      return;
    }
    if ((filter.operator === 'in' || filter.operator === 'not_in') && !Array.isArray(filter.value)) {
      errors.push(`${label} condition ${index + 1} needs a list of values`);
      return;
    }
    clean.push({
      field: filter.field,
      operator: filter.operator,
      ...(filter.operator !== 'exists' && filter.operator !== 'not_exists' ? { value: filter.value } : {}),
    });
  });
  return clean.length > 0 ? clean : null;
}

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

  // Type validation
  const type = raw.type ?? 'counter';
  if (type !== 'counter' && type !== 'steps') {
    errors.push(`Unsupported challenge type '${type}'. Use 'counter' or 'steps'`);
  }

  // Steps: ordered events, each with its own conditions
  let steps: ChallengeStep[] | null = null;
  if (type === 'steps') {
    const stepsRaw = raw.steps;
    if (!Array.isArray(stepsRaw) || stepsRaw.length < 2 || stepsRaw.length > MAX_STEPS) {
      errors.push(`A steps challenge needs between 2 and ${MAX_STEPS} steps`);
    } else {
      steps = [];
      stepsRaw.forEach((item, index) => {
        const step = item as Record<string, unknown>;
        if (!step || typeof step !== 'object') {
          errors.push(`Step ${index + 1} must be an object`);
          return;
        }
        if (typeof step.name !== 'string' || step.name.trim().length === 0 || step.name.length > 64) {
          errors.push(`Step ${index + 1} needs a name of up to 64 characters`);
        }
        if (typeof step.event !== 'string' || step.event.trim().length === 0 || step.event.length > 128) {
          errors.push(`Step ${index + 1} needs an event of up to 128 characters`);
        }
        const stepFilters = checkFilters(step.filters, `Step ${index + 1}`, errors);
        if (typeof step.name === 'string' && typeof step.event === 'string') {
          steps!.push({
            name: step.name.trim(),
            event: step.event.trim(),
            ...(stepFilters ? { filters: stepFilters } : {}),
          });
        }
      });
    }
  }
  const filters = checkFilters(raw.filters, 'Conditions', errors);

  // Trigger validation: a steps challenge starts with its first step's event
  const trigger = type === 'steps' ? steps?.[0]?.event : raw.trigger;
  if (typeof trigger !== 'string' || trigger.trim().length === 0 || trigger.length > 128) {
    errors.push('Trigger must be a non-empty string between 1 and 128 characters');
  }

  // Recurrence validation
  const recurrence = raw.recurrence ?? null;
  if (recurrence !== null && recurrence !== 'daily' && recurrence !== 'weekly') {
    errors.push("Recurrence must be 'daily', 'weekly' or empty");
  }

  // Target validation: a steps challenge is done after its last step
  const target = type === 'steps' ? steps?.length : raw.target;
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
    type: type as 'counter' | 'steps',
    target: target as number,
    filters,
    steps,
    recurrence: recurrence as 'daily' | 'weekly' | null,
    startAt: startAtDate,
    endAt: endAtDate,
    rewards: validatedRewards,
  };

  return { valid: true, errors: [], sanitized };
}
