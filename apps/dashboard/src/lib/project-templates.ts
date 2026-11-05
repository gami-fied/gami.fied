export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  event: string;
  samplePayload: Record<string, unknown>;
  xp: number;
  achievement: { key: string; name: string; description: string };
}

/** Starting points for the first rule, each with one event, an XP reward and a badge. */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'learning',
    name: 'Learning app',
    description: 'Reward finished lessons.',
    event: 'lesson_completed',
    samplePayload: { lessonId: 'intro', score: 100 },
    xp: 50,
    achievement: {
      key: 'first_lesson',
      name: 'First Lesson',
      description: 'Finished a first lesson.',
    },
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Reward logged workouts.',
    event: 'workout_logged',
    samplePayload: { minutes: 30, type: 'run' },
    xp: 25,
    achievement: {
      key: 'first_workout',
      name: 'First Workout',
      description: 'Logged a first workout.',
    },
  },
  {
    id: 'community',
    name: 'Community',
    description: 'Reward helpful posts.',
    event: 'post_published',
    samplePayload: { postId: 'welcome', words: 120 },
    xp: 10,
    achievement: { key: 'first_post', name: 'First Post', description: 'Published a first post.' },
  },
  {
    id: 'saas',
    name: 'SaaS onboarding',
    description: 'Reward setup steps.',
    event: 'setup_step_completed',
    samplePayload: { step: 'invite_team' },
    xp: 20,
    achievement: {
      key: 'getting_started',
      name: 'Getting Started',
      description: 'Finished a first setup step.',
    },
  },
];
