import crypto from 'crypto';

export type ConnectorType = 'segment' | 'rudderstack' | 'stripe' | 'github';
export const CONNECTOR_TYPES: ConnectorType[] = ['segment', 'rudderstack', 'stripe', 'github'];

/** An event ready to ingest, or a user profile update from an `identify` call. */
export type MappedItem =
  | { kind: 'event'; type: string; userId: string; payload: Record<string, unknown>; occurredAt: Date; idempotencyKey: string }
  | { kind: 'identify'; userId: string; name: string | null; email: string | null; traits: Record<string, unknown> };

export interface MapResult {
  items: MappedItem[];
  /** Messages that were understood but not used, such as anonymous visits. */
  skipped: number;
}

export interface ConnectorSettings {
  /** Stripe: the metadata key holding your user ID. Defaults to `gami_user_id`, then the customer ID. */
  userMetadataKey?: string;
  /** Segment and RudderStack: also count visitors who are not signed in, by their anonymous ID. */
  includeAnonymous?: boolean;
  /** Only these event types are turned into events. Empty means all. */
  allowedEvents?: string[];
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** `Order Completed` becomes `order_completed`, so names from other tools fit event types here. */
export function eventName(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9.]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 128);
}

/**
 * Checks the request really came from the service. Each service signs differently:
 * Stripe and GitHub sign the body with the shared secret, and Segment or RudderStack send the secret
 * as a bearer token or basic-auth user name (Segment's legacy `X-Signature` is accepted too).
 */
export function verifyConnectorRequest(type: ConnectorType, secret: string, rawBody: string, headers: Record<string, string | string[] | undefined>, now: Date = new Date()): boolean {
  const header = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  if (type === 'stripe') {
    const parts = Object.fromEntries((header('stripe-signature') ?? '').split(',').map((part) => part.split('=') as [string, string]));
    const timestamp = Number(parts['t']);
    if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > 300) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    return (header('stripe-signature') ?? '')
      .split(',')
      .filter((part) => part.startsWith('v1='))
      .some((part) => safeEqual(part.slice(3), expected));
  }

  if (type === 'github') {
    const given = header('x-hub-signature-256') ?? '';
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return safeEqual(given, expected);
  }

  const signature = header('x-signature');
  if (signature && safeEqual(signature, crypto.createHmac('sha1', secret).update(rawBody).digest('hex'))) return true;
  const auth = header('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return safeEqual(auth.slice(7).trim(), secret);
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const user = decoded.split(':')[0] ?? '';
    return safeEqual(user, secret);
  }
  return false;
}

const allowed = (settings: ConnectorSettings, type: string) => !settings.allowedEvents?.length || settings.allowedEvents.includes(type);

function asDate(value: unknown): Date {
  const date = typeof value === 'number' ? new Date(value * (value < 1e12 ? 1000 : 1)) : typeof value === 'string' ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Segment and RudderStack share one message format (track, identify, and batches of both). */
function mapSegmentLike(source: 'segment' | 'rudderstack', body: unknown, settings: ConnectorSettings): MapResult {
  const messages = Array.isArray((body as { batch?: unknown[] })?.batch) ? ((body as { batch: unknown[] }).batch) : [body];
  const items: MappedItem[] = [];
  let skipped = 0;
  for (const raw of messages) {
    const message = (raw ?? {}) as Record<string, unknown>;
    const userId = typeof message['userId'] === 'string' && message['userId'] ? (message['userId'] as string) : settings.includeAnonymous && typeof message['anonymousId'] === 'string' ? `anon:${message['anonymousId']}` : null;
    if (!userId) {
      skipped += 1;
      continue;
    }
    const kind = String(message['type'] ?? '').toLowerCase();
    if (kind === 'track' && typeof message['event'] === 'string') {
      const type = eventName(message['event'] as string);
      if (!type || !allowed(settings, type)) {
        skipped += 1;
        continue;
      }
      const id = typeof message['messageId'] === 'string' ? (message['messageId'] as string) : crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex');
      items.push({
        kind: 'event',
        type,
        userId,
        payload: { ...((message['properties'] as Record<string, unknown>) ?? {}), source },
        occurredAt: asDate(message['timestamp'] ?? message['originalTimestamp']),
        idempotencyKey: `${source}:${id}`.slice(0, 255),
      });
    } else if (kind === 'identify') {
      const traits = (message['traits'] as Record<string, unknown>) ?? {};
      const name = typeof traits['name'] === 'string' ? traits['name'] : [traits['firstName'], traits['lastName']].filter((part) => typeof part === 'string').join(' ') || null;
      items.push({ kind: 'identify', userId, name: name || null, email: typeof traits['email'] === 'string' ? traits['email'] : null, traits });
    } else {
      skipped += 1;
    }
  }
  return { items, skipped };
}

/** Stripe events become `stripe.<type>`, such as `stripe.invoice.paid`, with the useful amounts kept. */
function mapStripe(body: unknown, settings: ConnectorSettings): MapResult {
  const event = (body ?? {}) as { id?: string; type?: string; created?: number; data?: { object?: Record<string, unknown> } };
  const object = event.data?.object ?? {};
  if (!event.id || !event.type) return { items: [], skipped: 1 };
  const type = `stripe.${event.type}`;
  if (!allowed(settings, type)) return { items: [], skipped: 1 };
  const metadata = (object['metadata'] as Record<string, unknown> | undefined) ?? {};
  const key = settings.userMetadataKey || 'gami_user_id';
  const customer = typeof object['customer'] === 'string' ? (object['customer'] as string) : typeof object['object'] === 'string' && object['object'] === 'customer' ? (object['id'] as string) : null;
  const userId = typeof metadata[key] === 'string' && metadata[key] ? (metadata[key] as string) : customer;
  if (!userId) return { items: [], skipped: 1 };
  const cents = [object['amount_paid'], object['amount_total'], object['amount_received'], object['amount']].find((value) => typeof value === 'number') as number | undefined;
  return {
    items: [
      {
        kind: 'event',
        type,
        userId,
        payload: {
          stripeId: object['id'] ?? null,
          customer,
          // Stripe counts in cents. `amount` is in the currency's main unit, so rules can say "over 100".
          amount: cents !== undefined ? cents / 100 : null,
          amountCents: cents ?? null,
          currency: typeof object['currency'] === 'string' ? (object['currency'] as string).toUpperCase() : null,
          status: object['status'] ?? null,
          source: 'stripe',
        },
        occurredAt: asDate(event.created),
        idempotencyKey: `stripe:${event.id}`,
      },
    ],
    skipped: 0,
  };
}

/** GitHub webhooks become `github.<event>` or `github.<event>.<action>`; a merged pull request is `github.pull_request.merged`. */
function mapGithub(body: unknown, headers: Record<string, string | string[] | undefined>, settings: ConnectorSettings): MapResult {
  const name = String(headers['x-github-event'] ?? '');
  const delivery = String(headers['x-github-delivery'] ?? '');
  const payload = (body ?? {}) as Record<string, unknown>;
  if (!name || name === 'ping') return { items: [], skipped: 1 };
  const sender = (payload['sender'] as { login?: string } | undefined)?.login;
  if (!sender) return { items: [], skipped: 1 };
  const pr = payload['pull_request'] as { merged?: boolean; number?: number; additions?: number; deletions?: number } | undefined;
  let action = typeof payload['action'] === 'string' ? (payload['action'] as string) : null;
  if (name === 'pull_request' && action === 'closed' && pr?.merged) action = 'merged';
  const type = eventName(`github.${name}${action ? `.${action}` : ''}`);
  if (!allowed(settings, type)) return { items: [], skipped: 1 };
  const repo = (payload['repository'] as { full_name?: string } | undefined)?.full_name ?? null;
  return {
    items: [
      {
        kind: 'event',
        type,
        userId: sender,
        payload: {
          repository: repo,
          action,
          commits: Array.isArray(payload['commits']) ? (payload['commits'] as unknown[]).length : undefined,
          pullRequest: pr?.number ?? undefined,
          additions: pr?.additions ?? undefined,
          deletions: pr?.deletions ?? undefined,
          source: 'github',
        },
        occurredAt: new Date(),
        idempotencyKey: `github:${delivery || crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
      },
    ],
    skipped: 0,
  };
}

export function mapConnectorPayload(type: ConnectorType, body: unknown, headers: Record<string, string | string[] | undefined>, settings: ConnectorSettings = {}): MapResult {
  if (type === 'segment' || type === 'rudderstack') return mapSegmentLike(type, body, settings);
  if (type === 'stripe') return mapStripe(body, settings);
  return mapGithub(body, headers, settings);
}
