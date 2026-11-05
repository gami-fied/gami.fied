import type { DiscordEmbedTemplate } from '@gami.fied/sdk';
import type { ChecklistItem } from '@/components/ui/checklist';

export const EVENT_CHECKLIST_ITEMS: ChecklistItem<string>[] = [
  {
    value: 'xp_awarded',
    label: 'XP Awarded',
    description: 'Triggered whenever an end-user receives XP via rules or manual adjustment.',
    badge: 'XP System',
  },
  {
    value: 'achievement_unlocked',
    label: 'Achievement Unlocked',
    description: 'Triggered when an end-user unlocks a new achievement badge.',
    badge: 'Achievements',
  },
  {
    value: 'level_up',
    label: 'Level Up',
    description: 'Triggered when an end-user crosses a level XP threshold and levels up.',
    badge: 'Progression',
  },
  {
    value: 'challenge_completed',
    label: 'Challenge Completed',
    description: 'Triggered when an end-user completes all target progress requirements for a quest.',
    badge: 'Challenges',
  },
];

export const EVENT_TYPES = [
  { id: 'xp_awarded', label: 'XP Awarded', badge: 'XP' },
  { id: 'achievement_unlocked', label: 'Achievement Unlocked', badge: 'Achievement' },
  { id: 'level_up', label: 'Level Up', badge: 'Progression' },
  { id: 'challenge_completed', label: 'Challenge Completed', badge: 'Challenge' },
];

export const PLACEHOLDERS: Record<string, Array<{ key: string; description: string }>> = {
  xp_awarded: [
    { key: '{{xp}}', description: 'Amount of XP awarded' },
    { key: '{{currentXp}}', description: 'User total XP balance' },
    { key: '{{currentLevel}}', description: 'User current level number' },
    { key: '{{levelName}}', description: 'Title of current level' },
    { key: '{{xpToNextLevel}}', description: 'XP needed for next level' },
    { key: '{{progressPercent}}', description: 'Level progress %' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  achievement_unlocked: [
    { key: '{{achievementName}}', description: 'Name of unlocked achievement' },
    { key: '{{achievementId}}', description: 'ID of achievement' },
    { key: '{{achievementDescription}}', description: 'Achievement description' },
    { key: '{{badgeIconUrl}}', description: 'Badge icon image URL' },
    { key: '{{unlockedAt}}', description: 'Timestamp of unlock' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  level_up: [
    { key: '{{newLevel}}', description: 'New level number reached' },
    { key: '{{levelName}}', description: 'Title of new level' },
    { key: '{{previousLevel}}', description: 'Previous level number' },
    { key: '{{requiredXp}}', description: 'XP required for level' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  challenge_completed: [
    { key: '{{challengeName}}', description: 'Name of completed challenge' },
    { key: '{{challengeId}}', description: 'ID of challenge' },
    { key: '{{challengeDescription}}', description: 'Challenge description' },
    { key: '{{rewardXp}}', description: 'Bonus XP reward' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
};

export const DEFAULT_TEMPLATES: Record<string, DiscordEmbedTemplate> = {
  xp_awarded: {
    title: '⚡ XP Awarded',
    description: '**{{userName}}** earned **{{xp}} XP**!',
    color: '#F59E0B',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Current Level', value: 'Level {{currentLevel}} ({{levelName}})', inline: true },
      { name: 'Progress', value: '{{progressPercent}} ({{xpToNextLevel}} XP needed)', inline: true },
    ],
  },
  achievement_unlocked: {
    title: '🏆 Achievement Unlocked!',
    description: '🎉 **{{userName}}** unlocked **{{achievementName}}**!',
    color: '#10B981',
    footerText: 'Gami Gamification Engine',
    fields: [{ name: 'Details', value: '{{achievementDescription}}', inline: false }],
  },
  level_up: {
    title: '🎉 Level Up!',
    description: '🚀 **{{userName}}** reached **Level {{newLevel}}**!',
    color: '#06B6D4',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Title', value: '{{levelName}}', inline: true },
      { name: 'Previous Level', value: 'Level {{previousLevel}}', inline: true },
    ],
  },
  challenge_completed: {
    title: '⚔️ Challenge Completed!',
    description: '⚔️ **{{userName}}** completed **{{challengeName}}**!',
    color: '#8B5CF6',
    footerText: 'Gami Gamification Engine',
    fields: [{ name: 'Reward', value: '+{{rewardXp}} Bonus XP', inline: true }],
  },
};
