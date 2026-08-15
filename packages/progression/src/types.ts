export interface LevelDefinitionInput {
  id?: string;
  projectId?: string;
  level: number;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  enabled?: boolean;
  requiredXp: number | bigint;
}

export interface ProgressionResult {
  level: number;
  name: string;
  currentXp: number;
  levelRequiredXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface LevelValidationResult {
  valid: boolean;
  errors: string[];
}
