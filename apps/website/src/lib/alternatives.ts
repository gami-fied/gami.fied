/**
 * "Open-source alternative to" pages, one per hosted product named in the comparison.
 *
 * Every fact about another product comes from its own public page, linked as `source`, and was
 * read on the date in `CHECKED_ON`. Say only what that page says. When you re-check, update the
 * date; when a page no longer says something, remove it here.
 */
export const CHECKED_ON = '15 November 2026';

export interface Alternative {
  slug: string;
  /** The other product's name. */
  product: string;
  /** What kind of product it is, in a few words. */
  kind: string;
  /** Where its facts were read. */
  source: string;
  summary: string;
  /** What its own page says about it. */
  theirs: string[];
  /** The same points for Gami.Fied. */
  ours: string[];
  /** When the other product is the better choice. */
  chooseThem: string[];
  /** When Gami.Fied is. */
  chooseUs: string[];
}

export const ALTERNATIVES: Alternative[] = [
  {
    slug: 'trophy',
    product: 'Trophy',
    kind: 'a hosted gamification API',
    source: 'https://trophy.so/pricing',
    summary:
      'Trophy is a hosted service: you call its API and it runs the servers. Gami.Fied covers the same ground, streaks, achievements, points and leaderboards, as open-source software you run yourself.',
    theirs: [
      'Used through its API and SDKs. Its pricing page does not offer a self-hosted or open-source edition.',
      'Priced by monthly active users: the Pro plan is listed at $299 a month for 10,000 users, then a charge for each user above that.',
      'A 30-day free trial, and a programme for startups.',
      'Lists achievements, streaks, leaderboards, points, rewards, emails and push notifications.',
    ],
    ours: [
      'Runs on your own servers from one Docker Compose file. The server is AGPL and the SDK is MIT.',
      'Free at any number of players. You pay for the server it runs on.',
      'No trial to run out. A live demo and a browser playground let you try it first.',
      'Has streaks, achievements, levels, leaderboards, leagues, points and currencies, a reward store, emails and push notifications.',
    ],
    chooseThem: [
      'You do not want to run servers, and a monthly bill is fine.',
      'You want a company with a support contract behind the service today.',
    ],
    chooseUs: [
      'Player data has to stay in your own database.',
      'You expect many players and do not want the bill to grow with each one.',
      'You want to read or change the engine itself.',
    ],
  },
  {
    slug: 'open-loyalty',
    product: 'Open Loyalty',
    kind: 'an enterprise loyalty engine',
    source: 'https://www.openloyalty.io/',
    summary:
      'Open Loyalty is a loyalty platform for large brands, built around points, tiers and campaigns for shoppers. Gami.Fied is a smaller, open-source engine for product teams who want streaks, levels and badges inside their own app.',
    theirs: [
      'Describes itself as a loyalty engine for enterprise brands in retail, e-commerce, food, finance and similar fields.',
      'Its home page lists no prices; plans are on a separate pricing page.',
      'Lists points, tiers, rewards, wallets, referrals, challenges, badges, leaderboards, coupons and games of chance.',
      'Lists an uptime agreement, ISO 27001 and a team that helps with setup.',
    ],
    ours: [
      'Made for app engagement: events from your product go in, and XP, streaks, badges and rewards come out.',
      'Free and open source. You pay for the server it runs on.',
      'Has points and currencies, levels, rewards, wallets, invites, challenges, badges, leaderboards and leagues. It has no coupons.',
      'No uptime agreement, certification or setup team. It is a young project that you run yourself.',
    ],
    chooseThem: [
      'You run a loyalty programme for shoppers, with coupons, receipts and campaigns.',
      'You need certifications, an uptime agreement and a team to set it up.',
    ],
    chooseUs: [
      'You are adding game mechanics to an app, not running a shopper loyalty scheme.',
      'You want to start today without a sales call.',
      'You want the source code and the data on your own servers.',
    ],
  },
];
