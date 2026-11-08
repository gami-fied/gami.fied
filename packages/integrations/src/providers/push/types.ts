import type { IntegrationMessage } from '../../types.js';

export type DevicePlatform = 'ios' | 'android';

export interface PushDevice {
  token: string;
  platform: DevicePlatform;
}

/** Where a push provider finds a user's devices and forgets the ones a service says are gone. */
export interface DeviceStore {
  list(projectId: string, userId: string, platform: DevicePlatform): Promise<PushDevice[]>;
  remove(projectId: string, token: string): Promise<void>;
}

export interface PushContent {
  title: string;
  body: string;
  /** Extra values the app receives with the notification, as text. */
  data: Record<string, string>;
}

/** What a phone shows, from the same message the other integrations get. */
export function toPushContent(message: IntegrationMessage): PushContent {
  const data: Record<string, string> = { type: message.eventType };
  for (const [key, value] of Object.entries(message.metadata ?? {})) {
    if (['string', 'number', 'boolean'].includes(typeof value)) data[key] = String(value);
  }
  return { title: message.title.slice(0, 120), body: message.body.slice(0, 400), data };
}

/** Telling a bad token (forget it) from a bad moment (try again). */
export type SendOutcome = { ok: true } | { ok: false; error: string; retryable: boolean; invalidToken?: boolean };
