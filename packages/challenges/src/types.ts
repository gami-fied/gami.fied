export type ChallengeType = 'counter' | 'steps';

/** `daily` or `weekly` start the challenge over each UTC day or Monday-to-Sunday week. */
export type ChallengeRecurrence = 'daily' | 'weekly';

/** A payload condition an event must meet, such as `{ field: 'payload.score', operator: 'greater_than', value: 80 }`. */
export interface ChallengeFilter {
  field: string;
  operator: string;
  value?: unknown;
}

export interface ChallengeStep {
  name: string;
  /** The event that completes this step, once the steps before it are done. */
  event: string;
  filters?: ChallengeFilter[];
}

export type ChallengeReward =
  { type: 'xp'; amount: number } | { type: 'achievement'; achievementKey: string };

export interface ChallengeDefinition {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  enabled: boolean;
  trigger: string;
  type: ChallengeType;
  target: number;
  filters?: ChallengeFilter[] | null;
  steps?: ChallengeStep[] | null;
  recurrence?: ChallengeRecurrence | null;
  startAt: Date | string | null;
  endAt: Date | string | null;
  rewards: ChallengeReward[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChallengeInput {
  key: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  enabled?: boolean;
  trigger: string;
  type?: ChallengeType;
  target: number;
  filters?: ChallengeFilter[] | null;
  steps?: ChallengeStep[] | null;
  recurrence?: ChallengeRecurrence | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  rewards: ChallengeReward[];
}

export interface ChallengeProgress {
  id: string;
  projectId: string;
  userId: string;
  challengeId: string;
  progress: number;
  periodKey?: string;
  completed: boolean;
  completedAt: Date | string | null;
}

export interface ChallengeEvaluationResult {
  progressed: boolean;
  completed: boolean;
  newlyCompleted: boolean;
  newProgress: number;
  target: number;
  reason?: string;
}
