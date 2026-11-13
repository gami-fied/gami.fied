import { repoFile } from './site';

/**
 * The six feature areas, used by the home page grid, the features index and one page each.
 * Keep this true to the product: every capability listed here exists in the current release.
 */
export interface Capability {
  title: string;
  text: string;
}

export interface FeatureArea {
  slug: 'progression' | 'economy' | 'competition' | 'community' | 'integrations' | 'administration';
  name: string;
  /** One line, for cards and the page header. */
  tagline: string;
  /** A short paragraph for the top of the page. */
  summary: string;
  capabilities: Capability[];
  guides: { label: string; href: string }[];
}

export const FEATURES: FeatureArea[] = [
  {
    slug: 'progression',
    name: 'Progression',
    tagline: 'XP, levels, streaks, achievements and challenges.',
    summary:
      'Reward the things that matter in your app. Rules turn events into XP and badges, streaks keep people coming back, and challenges give them something to aim for.',
    capabilities: [
      { title: 'Rules without code changes', text: 'Match events on their type and fields, totals over time such as "spent $100 this month", or a JSONLogic expression. Draft, publish, roll back, and test a rule against past events before it goes live.' },
      { title: 'XP and levels', text: 'An append-only ledger records every point and why it was given, so a balance can always be explained. Levels follow from XP.' },
      { title: 'Streaks', text: 'Daily or weekly, counted in each player\'s own time zone, with freezes that save a missed day and reminders before a streak breaks.' },
      { title: 'Achievements', text: 'Badges that earn themselves from a count, a total, unique values or a streak, with tiers, bonus XP, progress bars and secret badges.' },
      { title: 'Challenges', text: 'Quests with steps in order, conditions on the events that count, and repeats every day or week.' },
      { title: 'Boosts and limits', text: 'Double XP weekends, happy hours and launch promotions, plus caps and cooldowns so rewards cannot be farmed.' },
    ],
    guides: [
      { label: 'Gamification mechanics', href: repoFile('docs/gamification-mechanics.md') },
      { label: 'Boosts, limits and safe rule changes', href: repoFile('docs/economy-and-store.md') },
    ],
  },
  {
    slug: 'economy',
    name: 'Economy',
    tagline: 'Currencies, wallets and a reward store.',
    summary:
      'Give people points they can save and spend. Currencies can expire, a store sells real rewards, and every purchase is exact: two people can never take the last one.',
    capabilities: [
      { title: 'Currencies and wallets', text: 'Coins, gems or anything else, separate from XP. Points can expire, are spent soonest-to-expire first, and people are told three days before they lapse.' },
      { title: 'A reward store', text: 'Rewards with a price, stock and a limit per person. Deliver them yourself, hand out codes from a list, or generate a unique coupon for each purchase.' },
      { title: 'Purchases that add up', text: 'Points, stock, limits and codes change in one step, so nothing is oversold and nobody spends the same points twice.' },
      { title: 'Fulfilment and refunds', text: 'Mark purchases delivered or cancel them with a refund. `reward.redeemed` and `reward.cancelled` webhooks tell your systems.' },
      { title: 'Rewards from rules', text: 'The "give currency" rule action pays out on any event, once per rule run, even when an event is retried.' },
      { title: 'A full history', text: 'Every earn, spend, refund and expiry is in the wallet history with its reason.' },
    ],
    guides: [{ label: 'Currencies, wallets and the store', href: repoFile('docs/economy-and-store.md') }],
  },
  {
    slug: 'competition',
    name: 'Competition',
    tagline: 'Leaderboards, segments, teams and leagues.',
    summary:
      'Let people compete with the right crowd. Rank everyone, a country, a team or just friends, and put players in small leagues where moving up feels possible.',
    capabilities: [
      { title: 'Leaderboards', text: 'All time, daily, weekly or monthly, fast at any size. Players can see the board and their own place from their browser.' },
      { title: 'Segments', text: 'Save groups such as "everyone in India" or "Pro plan", built from user fields or anything in their metadata, and give each its own board.' },
      { title: 'Team and country boards', text: 'Rank teams, countries or any attribute against each other, by total or average XP so small teams can still win.' },
      { title: 'Leagues', text: 'Tiers of small groups, such as Bronze to Diamond, that compete each week or day. The top move up and the bottom move down.' },
      { title: 'Friends boards', text: 'A player can see how they rank among their friends only.' },
      { title: 'Fair play', text: 'Flags for people earning unusually fast, and a quiet way to hide someone from every board while they keep playing.' },
    ],
    guides: [{ label: 'Segments, leagues and social play', href: repoFile('docs/social-and-competition.md') }],
  },
  {
    slug: 'community',
    name: 'Community',
    tagline: 'Friends, kudos, a feed and invites.',
    summary:
      'Make progress social. Players add friends, cheer each other on, share what they earned, and bring new people in with invite codes that reward both sides.',
    capabilities: [
      { title: 'Friends', text: 'Players add each other by invite code, so nobody\'s ID or email is ever exposed.' },
      { title: 'Kudos', text: 'A quick thank-you between friends, limited to one a day per friend so it stays meaningful.' },
      { title: 'An activity feed', text: 'What a player and their friends did lately: badges earned, kudos received and league promotions.' },
      { title: 'Share cards', text: 'A signed link to an image of an achievement, ready for social media, that cannot be guessed or edited.' },
      { title: 'Invites', text: 'Codes that reward the inviter and the new player in XP or currency, when they join or when they first do something you choose, with a limit per player.' },
    ],
    guides: [{ label: 'Segments, leagues and social play', href: repoFile('docs/social-and-competition.md') }],
  },
  {
    slug: 'integrations',
    name: 'Integrations',
    tagline: 'SDK, React, webhooks, connectors and plugins.',
    summary:
      'Fits into what you already run. Send events from your servers or your users\' browsers, listen with signed webhooks, and connect the tools your data already lives in.',
    capabilities: [
      { title: 'TypeScript SDK', text: 'Typed calls for every public route, retries with backoff, and short-lived tokens so browsers can read a player\'s own data safely.' },
      { title: 'React components', text: 'A provider, hooks and drop-in components for levels, badges, streaks, leaderboards, challenges, notifications and toasts.' },
      { title: 'Live updates', text: 'Players get notifications and XP the moment they happen, over a stream that reconnects on its own.' },
      { title: 'Webhooks and messages', text: 'Signed webhooks to your servers, messages to Slack, Microsoft Teams or any HTTPS endpoint, and push through Firebase and Apple.' },
      { title: 'Connectors', text: 'Events straight from Segment, RudderStack, Stripe and GitHub, with signatures checked and duplicates ignored.' },
      { title: 'Plugins', text: 'Rule actions of your own, such as sending a gift through your shop, loaded from your server and checked before a rule is saved.' },
    ],
    guides: [
      { label: 'SDK', href: repoFile('docs/sdk.md') },
      { label: 'React components', href: repoFile('docs/react.md') },
      { label: 'Notifications and integrations', href: repoFile('docs/notifications-and-integrations.md') },
      { label: 'Connectors, environments and plugins', href: repoFile('docs/connectors-environments-and-plugins.md') },
    ],
  },
  {
    slug: 'administration',
    name: 'Administration',
    tagline: 'Run it like the rest of your stack.',
    summary:
      'Everything an operator needs: a dashboard for your team, safe ways to change rules, staging that promotes to production, and controls for every organization on your instance.',
    capabilities: [
      { title: 'A dashboard for your team', text: 'Rules, players, the store, leagues and analytics in one place, with roles for owners, admins and members, and an audit log.' },
      { title: 'Staging and promotion', text: 'Build in a staging project with test keys, compare it with production, and promote the changes you choose in one step.' },
      { title: 'Feature controls', text: 'Turn features on or off for the whole instance or one organization. Features that depend on each other are kept consistent, and you are asked first.' },
      { title: 'Organization rules', text: 'Limits on projects and members, allowed email domains, API key lifetimes, address allowlists and event rates, per organization.' },
      { title: 'Keys and access', text: 'API keys with scopes, test and live prefixes, and emergency controls to revoke every key or sign everyone out.' },
      { title: 'Operations', text: 'Prometheus metrics, structured logs, backups and restore, data export and import, and retention settings.' },
    ],
    guides: [
      { label: 'Features and organization rules', href: repoFile('docs/platform-administration-features.md') },
      { label: 'Operations', href: repoFile('docs/operations.md') },
      { label: 'Deployment and production', href: repoFile('docs/deployment-and-production.md') },
    ],
  },
];

export const featureBySlug = (slug: string) => FEATURES.find((feature) => feature.slug === slug);
