import { AchievementsResource } from './achievements.js';
import { AuditLogsResource } from './audit-logs.js';
import { ChallengesResource } from './challenges.js';
import { EventsResource } from './events.js';
import { HttpClient } from './http.js';
import { LeaderboardsResource } from './leaderboards.js';
import { LevelsResource } from './levels.js';
import { NotificationsResource } from './notifications.js';
import { SystemResource } from './system.js';
import type { GamiConfig } from './types.js';
import { UsersResource } from './users.js';
import { WebhooksResource } from './webhooks.js';
import { XpResource } from './xp.js';

export class Gami {
  private readonly http: HttpClient;

  public readonly events: EventsResource;
  public readonly users: UsersResource;
  public readonly xp: XpResource;
  public readonly achievements: AchievementsResource;
  public readonly levels: LevelsResource;
  public readonly leaderboards: LeaderboardsResource;
  public readonly challenges: ChallengesResource;
  public readonly notifications: NotificationsResource;
  public readonly webhooks: WebhooksResource;
  public readonly auditLogs: AuditLogsResource;
  public readonly system: SystemResource;

  constructor(config: GamiConfig) {
    this.http = new HttpClient(config);

    this.events = new EventsResource(this.http);
    this.users = new UsersResource(this.http);
    this.xp = new XpResource(this.http);
    this.achievements = new AchievementsResource(this.http);
    this.levels = new LevelsResource(this.http);
    this.leaderboards = new LeaderboardsResource(this.http);
    this.challenges = new ChallengesResource(this.http);
    this.notifications = new NotificationsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.auditLogs = new AuditLogsResource(this.http);
    this.system = new SystemResource(this.http);
  }
}
