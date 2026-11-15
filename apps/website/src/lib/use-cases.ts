/**
 * The kinds of app Gami.Fied is most often used for, one page each. They match the project
 * templates in the dashboard, so what a page describes is what a new project starts with.
 */
export interface UseCase {
  slug: string;
  name: string;
  /** One line under the title. */
  tagline: string;
  summary: string;
  /** Events the app sends, with what each one means. */
  events: { name: string; when: string }[];
  /** What players get, each tied to a mechanic. */
  mechanics: { title: string; text: string }[];
  /** A rule to start from, shown as the JSON a project would hold. */
  rule: { trigger: string; actions: unknown[]; conditions?: unknown };
  /** A word of caution, because gamification can also do harm. */
  caution: string;
  guides: { label: string; href: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'learning',
    name: 'Learning apps',
    tagline: 'Keep learners coming back tomorrow.',
    summary:
      'Courses, language apps and study tools live on habit. Reward a finished lesson, keep a daily streak going, and give learners a level that shows how far they have come.',
    events: [
      { name: 'lesson_completed', when: 'A learner finishes a lesson.' },
      { name: 'quiz_passed', when: 'They pass a quiz, with the score in the payload.' },
      { name: 'course_completed', when: 'They finish a whole course.' },
    ],
    mechanics: [
      { title: 'Daily streak with freezes', text: 'A streak counts days with a lesson, in the learner’s own time zone. A freeze saves a missed day, so one bad day does not undo a month.' },
      { title: 'Levels that mean something', text: 'XP per lesson adds up to levels you name yourself, such as Beginner to Fluent.' },
      { title: 'Badges for milestones', text: 'First lesson, a perfect score, a hundred lessons. Tiered badges show progress towards the next one.' },
      { title: 'A weekly league', text: 'Small groups at the same level, with promotion and relegation each week.' },
    ],
    rule: { trigger: 'lesson_completed', actions: [{ type: 'award_xp', params: { amount: 50 } }] },
    caution: 'Streaks can turn learning into a chore. Give freezes, and never punish a break with lost progress.',
    guides: [
      { label: 'Events, rules and progression', href: '/docs/gamification-mechanics/' },
      { label: 'Segments, leagues and social', href: '/docs/social-and-competition/' },
    ],
  },
  {
    slug: 'fitness',
    name: 'Fitness and health apps',
    tagline: 'Reward showing up, not just the personal best.',
    summary:
      'Fitness is about turning up week after week. Count workouts and distance, set weekly goals that suit real life, and let friends cheer each other on.',
    events: [
      { name: 'workout_completed', when: 'A workout ends, with its kind and length.' },
      { name: 'distance_logged', when: 'A run, ride or walk is recorded, with the distance.' },
      { name: 'goal_reached', when: 'A personal goal is met.' },
    ],
    mechanics: [
      { title: 'A weekly streak', text: 'Three workouts a week is a healthier target than every single day, and a weekly streak rewards exactly that.' },
      { title: 'Totals over time', text: 'A rule can fire when a total is reached, such as 100 km this month, without your app doing the sums.' },
      { title: 'Challenges with steps', text: 'A plan such as "couch to 5 km" as ordered steps, or a weekly quest that renews.' },
      { title: 'Friends and kudos', text: 'Players add friends by code, see each other’s milestones and send a thank-you.' },
    ],
    rule: {
      trigger: 'distance_logged',
      conditions: { all: [{ aggregate: { metric: 'sum', field: 'payload.km', window: 'calendar_month' }, operator: 'greater_than_or_equal', value: 100 }] },
      actions: [{ type: 'award_achievement', params: { achievementKey: 'hundred_km_month' } }],
    },
    caution: 'Leaderboards by raw distance reward those who are already fit. Rank by improvement or consistency, or keep boards among friends.',
    guides: [
      { label: 'Events, rules and progression', href: '/docs/gamification-mechanics/' },
      { label: 'Segments, leagues and social', href: '/docs/social-and-competition/' },
    ],
  },
  {
    slug: 'community',
    name: 'Communities and forums',
    tagline: 'Recognise the people who make the place worth visiting.',
    summary:
      'A community runs on a few generous members. Give credit for helpful answers, show who is contributing, and welcome new members with a first step that is easy to take.',
    events: [
      { name: 'post_created', when: 'A member starts a thread or writes a post.' },
      { name: 'answer_accepted', when: 'Their answer is marked as the solution.' },
      { name: 'member_invited', when: 'Someone they invited joins.' },
    ],
    mechanics: [
      { title: 'Reputation as XP', text: 'More for an accepted answer than for a post, so quality counts for more than volume.' },
      { title: 'Limits against farming', text: 'Caps and cooldowns per person stop a flood of low-effort posts from earning anything.' },
      { title: 'Boards by team or country', text: 'Segments make a board for each group, so newcomers are not lost behind long-standing members.' },
      { title: 'Invites that reward both sides', text: 'A reward when an invited member takes their first real step, not just when they sign up.' },
    ],
    rule: { trigger: 'answer_accepted', actions: [{ type: 'award_xp', params: { amount: 25 } }] },
    caution: 'Points for posting invite spam. Reward what other members valued, and set limits before you launch.',
    guides: [
      { label: 'Economy and store', href: '/docs/economy-and-store/' },
      { label: 'Segments, leagues and social', href: '/docs/social-and-competition/' },
    ],
  },
  {
    slug: 'saas-onboarding',
    name: 'SaaS onboarding',
    tagline: 'Guide new accounts to the moment the product clicks.',
    summary:
      'Most accounts that leave never finished setting up. Turn setup into a short checklist with a clear end, and mark the first real success so people know they have arrived.',
    events: [
      { name: 'profile_completed', when: 'The account fills in its profile.' },
      { name: 'integration_connected', when: 'They connect their first integration.' },
      { name: 'teammate_invited', when: 'They invite a colleague.' },
    ],
    mechanics: [
      { title: 'A checklist as a challenge', text: 'Ordered steps with a visible finish. Each step is an event your product already has.' },
      { title: 'One badge for being set up', text: 'A single clear "you are ready" moment does more here than a wall of badges.' },
      { title: 'Reminders that stop', text: 'A campaign email to accounts that stall, which never repeats and respects unsubscribes.' },
      { title: 'Measure it', text: 'Compare accounts that finished the checklist with those that did not, before deciding it works.' },
    ],
    rule: { trigger: 'integration_connected', actions: [{ type: 'award_achievement', params: { achievementKey: 'connected' } }] },
    caution: 'Business users tire of games quickly. Keep it to progress and completion, and leave leaderboards out.',
    guides: [
      { label: 'Events, rules and progression', href: '/docs/gamification-mechanics/' },
      { label: 'Notifications and webhooks', href: '/docs/notifications-and-integrations/' },
    ],
  },
];
