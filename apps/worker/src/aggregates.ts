import { measureAggregate } from '@gami/database';
import { resolveAggregates, type AggregateValues, type EventData } from '@gami/rules';

/** The aggregates a rule's conditions ask for, measured from this user's past events. */
export function computeAggregates(conditions: unknown, event: EventData): Promise<AggregateValues | undefined> {
  return resolveAggregates(conditions, event, (query) =>
    measureAggregate({
      projectId: event.projectId,
      userId: event.userId as string,
      metric: query.spec.metric,
      eventType: query.event,
      field: query.spec.field,
      start: query.start,
      end: query.at,
      excludeEventId: query.excludeEventId,
    })
  );
}
