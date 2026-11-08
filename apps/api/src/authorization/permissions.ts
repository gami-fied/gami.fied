/**
 * The permission map for every project-scoped route.
 *
 * Access is derived from the matched route instead of being repeated in handlers, so a
 * new route is protected by default: writes need an admin session or a matching API key
 * scope, and any path this map does not recognise is closed to API keys.
 */

export type MinRole = 'member' | 'admin';

export interface RoutePermission {
  /** API key scope required, for example `rules:write`. */
  scope: string;
  /** API keys are refused outright. These routes need a signed-in user. */
  sessionOnly: boolean;
  /** Lowest organization role a signed-in user needs. */
  minRole: MinRole;
}

export const SCOPE_RESOURCES = [
  'project',
  'events',
  'rules',
  'users',
  'xp',
  'achievements',
  'streaks',
  'wallets',
  'rewards',
  'levels',
  'leaderboard',
  'challenges',
  'notifications',
  'webhooks',
  'integrations',
  'analytics',
  'audit-logs',
  'system',
] as const;

export type ScopeResource = (typeof SCOPE_RESOURCES)[number];

/** New keys get only this unless more is requested, because most keys just send events. */
export const DEFAULT_API_KEY_SCOPES = ['events:write'];

const SCOPE_PATTERN = new RegExp(`^(${SCOPE_RESOURCES.join('|')}):(read|write)$`);

/** Second path segment under `/users/:userId/` mapped to the resource that owns it. */
const USER_SUB_RESOURCES: Record<string, ScopeResource> = {
  xp: 'xp',
  achievements: 'achievements',
  streaks: 'streaks',
  wallets: 'wallets',
  redemptions: 'rewards',
  rewards: 'rewards',
  challenges: 'challenges',
  notifications: 'notifications',
  'notification-preferences': 'notifications',
  progress: 'levels',
};

/** Top-level path segments that do not match their scope resource name. */
const RESOURCE_ALIASES: Record<string, ScopeResource> = {
  progression: 'levels',
  metrics: 'system',
  onboarding: 'system',
  'email-deliveries': 'notifications',
};

/** Credentials and team access. A leaked key must never be able to widen its own reach. */
const SESSION_ONLY_RESOURCES = new Set(['api-keys', 'members']);

/** Reads that expose operational data, so plain members cannot see them. */
const ADMIN_READ_RESOURCES = new Set(['audit-logs', 'email-deliveries', 'api-keys', 'members', 'campaigns']);

/** POST routes that compute a result and change nothing. */
const READ_ONLY_POST_PATTERNS = [/^rules\/preview$/, /^rules\/simulate$/, /^integrations\/[^/]+\/templates\/preview$/];

/** Writes that any project member may perform. */
const MEMBER_WRITE_PATTERNS = [
  /^events\/test$/,
  /^users\/[^/]+\/notifications(\/|$)/,
  /^users\/[^/]+\/notification-preferences$/,
];

export function isValidScope(scope: string): boolean {
  return scope === '*' || SCOPE_PATTERN.test(scope);
}

/** A `write` scope also grants `read` on the same resource. */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (granted.includes('*') || granted.includes('full') || granted.includes(required)) return true;
  const [resource, action] = required.split(':');
  return action === 'read' && granted.includes(`${resource}:write`);
}

function resolveResource(segments: string[]): string {
  const [first, , third] = segments;
  if (first === 'users' && third && USER_SUB_RESOURCES[third]) return USER_SUB_RESOURCES[third];
  return (first && RESOURCE_ALIASES[first]) || first || 'project';
}

/**
 * Resolves the permission for a route pattern such as
 * `/api/projects/:projectId/users/:userId/xp/adjust`.
 */
export function resolveProjectPermission(method: string, routeUrl: string): RoutePermission {
  const match = routeUrl.match(/^\/api\/projects\/[^/]+(?:\/(.*))?$/);
  if (!match) return { scope: 'unknown:write', sessionOnly: true, minRole: 'admin' };

  const path = match[1] ?? '';
  const segments = path ? path.split('/') : [];
  const firstSegment = segments[0] ?? '';
  const resource = resolveResource(segments);

  const isRead =
    method === 'GET' ||
    method === 'HEAD' ||
    READ_ONLY_POST_PATTERNS.some((pattern) => pattern.test(path));
  const scope = `${resource}:${isRead ? 'read' : 'write'}`;

  const isProjectWrite = segments.length === 0 && !isRead;
  const isKnownResource = (SCOPE_RESOURCES as readonly string[]).includes(resource);
  const sessionOnly =
    isProjectWrite || SESSION_ONLY_RESOURCES.has(firstSegment) || !isKnownResource;

  const memberWrite = MEMBER_WRITE_PATTERNS.some((pattern) => pattern.test(path));
  const minRole: MinRole =
    ADMIN_READ_RESOURCES.has(firstSegment) || (!isRead && !memberWrite) ? 'admin' : 'member';

  return { scope, sessionOnly, minRole };
}
