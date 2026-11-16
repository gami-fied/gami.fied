import {
  BadgeGrid,
  ChallengeList,
  CosmeticLocker,
  JourneyPath,
  Leaderboard,
  LevelProgress,
  MysteryBox,
  NotificationFeed,
  NotificationInbox,
  SeasonPass,
  SharedGoals,
  StreakCalendar,
  TeamCard,
  ToastHost,
} from '@gami.fied/react';
import type { ComponentType } from 'react';

/** How an attribute's text becomes a prop. */
export type AttributeKind = 'string' | 'number' | 'boolean' | { oneOf: readonly string[] };

export interface ElementDefinition {
  /** The React component this element draws. */
  // The props differ per component, and are checked where each attribute is declared below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  /** Attribute name to the prop it sets and how it is read. */
  attributes: Record<string, { prop: string; kind: AttributeKind }>;
  /** A prop that takes a function, sent to the page as an event of this name. */
  events?: Record<string, string>;
}

const PERIODS = ['all_time', 'daily', 'weekly', 'monthly'] as const;
const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

/** Every element, by tag name. Each draws the React component of the same name. */
export const ELEMENTS: Record<string, ElementDefinition> = {
  'gami-level-progress': { component: LevelProgress, attributes: {} },
  'gami-badge-grid': { component: BadgeGrid, attributes: { 'show-locked': { prop: 'showLocked', kind: 'boolean' } } },
  'gami-streak-calendar': { component: StreakCalendar, attributes: { streak: { prop: 'streak', kind: 'string' }, weeks: { prop: 'weeks', kind: 'number' } } },
  'gami-leaderboard': { component: Leaderboard, attributes: { period: { prop: 'period', kind: { oneOf: PERIODS } }, limit: { prop: 'limit', kind: 'number' } } },
  'gami-challenge-list': { component: ChallengeList, attributes: {} },
  'gami-notification-feed': { component: NotificationFeed, attributes: { limit: { prop: 'limit', kind: 'number' } } },
  'gami-notification-inbox': { component: NotificationInbox, attributes: { limit: { prop: 'limit', kind: 'number' }, 'mark-on-click': { prop: 'markOnClick', kind: 'boolean' } } },
  'gami-toasts': { component: ToastHost, attributes: { duration: { prop: 'duration', kind: 'number' }, position: { prop: 'position', kind: { oneOf: CORNERS } } } },
  'gami-mystery-box': { component: MysteryBox, attributes: { box: { prop: 'box', kind: 'string' } }, events: { onOpen: 'gami-open' } },
  'gami-season-pass': { component: SeasonPass, attributes: { pass: { prop: 'pass', kind: 'string' } } },
  'gami-shared-goals': { component: SharedGoals, attributes: {} },
  'gami-team-card': { component: TeamCard, attributes: {} },
  'gami-journey-path': { component: JourneyPath, attributes: { journey: { prop: 'journey', kind: 'string' } } },
  'gami-cosmetic-locker': { component: CosmeticLocker, attributes: {} },
};

/**
 * Reads one attribute. Null means "leave the prop out", so the component's own default applies:
 * that is what a missing attribute, a number that is not one, or a value off the list gives.
 * A boolean attribute is on when present, as in HTML, unless it says `false`.
 */
export function readAttribute(kind: AttributeKind, value: string | null): string | number | boolean | null {
  if (value === null) return null;
  if (kind === 'string') return value === '' ? null : value;
  if (kind === 'number') {
    const number = Number(value);
    return value.trim() !== '' && Number.isFinite(number) ? number : null;
  }
  if (kind === 'boolean') return value !== 'false';
  return kind.oneOf.includes(value) ? value : null;
}

/** The props for an element, from the attributes it has right now. */
export function propsFrom(definition: ElementDefinition, get: (name: string) => string | null): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, { prop, kind }] of Object.entries(definition.attributes)) {
    const value = readAttribute(kind, get(name));
    if (value !== null) props[prop] = value;
  }
  return props;
}
