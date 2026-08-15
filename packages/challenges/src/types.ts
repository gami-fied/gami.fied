export type ChallengeType = 'counter';

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
