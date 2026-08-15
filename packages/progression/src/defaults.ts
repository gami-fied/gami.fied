import { LevelDefinitionInput } from './types.js';

export function getDefaultLevelDefinitions(projectId: string): LevelDefinitionInput[] {
  return [
    {
      projectId,
      level: 1,
      name: 'Novice',
      description: 'Beginning of the journey',
      requiredXp: 0,
      enabled: true,
    },
    {
      projectId,
      level: 2,
      name: 'Explorer',
      description: 'Gaining experience',
      requiredXp: 100,
      enabled: true,
    },
    {
      projectId,
      level: 3,
      name: 'Achiever',
      description: 'Showing dedication',
      requiredXp: 250,
      enabled: true,
    },
    {
      projectId,
      level: 4,
      name: 'Expert',
      description: 'Mastering skills',
      requiredXp: 500,
      enabled: true,
    },
    {
      projectId,
      level: 5,
      name: 'Legend',
      description: 'Reaching the pinnacle of achievement',
      requiredXp: 1000,
      enabled: true,
    },
  ];
}
