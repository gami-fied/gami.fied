export interface ProcessMetricsData {
  eventsIngestedTotal: number;
  eventsProcessedTotal: number;
  eventsFailedTotal: number;
  rulesEvaluatedTotal: number;
  rulesMatchedTotal: number;
  ruleExecutionFailuresTotal: number;
  xpAwardedTotal: number;
  xpAdjustmentTotal: number;
  achievementsUnlockedTotal: number;
  challengesCompletedTotal: number;
  notificationsCreatedTotal: number;
  notificationsDeliveredTotal: number;
  notificationDeliveryFailuresTotal: number;
  webhookDeliveriesTotal: number;
  webhookDeliveriesSuccessTotal: number;
  webhookDeliveriesFailedTotal: number;
  httpRequestsTotal: number;
  httpErrorsTotal: number;
  httpRouteStats: Record<string, { requests: number; errors: number; totalDurationMs: number }>;
}

class ProcessMetricsCollector {
  private data: ProcessMetricsData = {
    eventsIngestedTotal: 0,
    eventsProcessedTotal: 0,
    eventsFailedTotal: 0,
    rulesEvaluatedTotal: 0,
    rulesMatchedTotal: 0,
    ruleExecutionFailuresTotal: 0,
    xpAwardedTotal: 0,
    xpAdjustmentTotal: 0,
    achievementsUnlockedTotal: 0,
    challengesCompletedTotal: 0,
    notificationsCreatedTotal: 0,
    notificationsDeliveredTotal: 0,
    notificationDeliveryFailuresTotal: 0,
    webhookDeliveriesTotal: 0,
    webhookDeliveriesSuccessTotal: 0,
    webhookDeliveriesFailedTotal: 0,
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
    httpRouteStats: {},
  };

  public incEventsIngested(count = 1) { this.data.eventsIngestedTotal += count; }
  public incEventsProcessed(count = 1) { this.data.eventsProcessedTotal += count; }
  public incEventsFailed(count = 1) { this.data.eventsFailedTotal += count; }

  public incRulesEvaluated(count = 1) { this.data.rulesEvaluatedTotal += count; }
  public incRulesMatched(count = 1) { this.data.rulesMatchedTotal += count; }
  public incRuleExecutionFailures(count = 1) { this.data.ruleExecutionFailuresTotal += count; }

  public incXpAwarded(amount: number) { this.data.xpAwardedTotal += amount; }
  public incXpAdjustment(amount: number) { this.data.xpAdjustmentTotal += amount; }

  public incAchievementsUnlocked(count = 1) { this.data.achievementsUnlockedTotal += count; }
  public incChallengesCompleted(count = 1) { this.data.challengesCompletedTotal += count; }

  public incNotificationsCreated(count = 1) { this.data.notificationsCreatedTotal += count; }
  public incNotificationsDelivered(count = 1) { this.data.notificationsDeliveredTotal += count; }
  public incNotificationDeliveryFailures(count = 1) { this.data.notificationDeliveryFailuresTotal += count; }

  public incWebhookDeliveries(count = 1) { this.data.webhookDeliveriesTotal += count; }
  public incWebhookDeliveriesSuccess(count = 1) { this.data.webhookDeliveriesSuccessTotal += count; }
  public incWebhookDeliveriesFailed(count = 1) { this.data.webhookDeliveriesFailedTotal += count; }

  public recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
    this.data.httpRequestsTotal++;
    if (status >= 400) {
      this.data.httpErrorsTotal++;
    }

    // Low-cardinality route key formatting (e.g. GET /api/projects/:projectId/events)
    const routeKey = `${method.toUpperCase()} ${route}`;
    if (!this.data.httpRouteStats[routeKey]) {
      this.data.httpRouteStats[routeKey] = { requests: 0, errors: 0, totalDurationMs: 0 };
    }
    const stat = this.data.httpRouteStats[routeKey];
    stat.requests++;
    if (status >= 400) stat.errors++;
    stat.totalDurationMs += durationMs;
  }

  public getSnapshot(): ProcessMetricsData {
    return { ...this.data, httpRouteStats: { ...this.data.httpRouteStats } };
  }

  public reset() {
    this.data = {
      eventsIngestedTotal: 0,
      eventsProcessedTotal: 0,
      eventsFailedTotal: 0,
      rulesEvaluatedTotal: 0,
      rulesMatchedTotal: 0,
      ruleExecutionFailuresTotal: 0,
      xpAwardedTotal: 0,
      xpAdjustmentTotal: 0,
      achievementsUnlockedTotal: 0,
      challengesCompletedTotal: 0,
      notificationsCreatedTotal: 0,
      notificationsDeliveredTotal: 0,
      notificationDeliveryFailuresTotal: 0,
      webhookDeliveriesTotal: 0,
      webhookDeliveriesSuccessTotal: 0,
      webhookDeliveriesFailedTotal: 0,
      httpRequestsTotal: 0,
      httpErrorsTotal: 0,
      httpRouteStats: {},
    };
  }
}

export const processMetrics = new ProcessMetricsCollector();
