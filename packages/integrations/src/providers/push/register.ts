import { db, pushDevices } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { registry } from '../../registry.js';
import { ApnsPushProvider } from './apns.js';
import { FcmPushProvider } from './fcm.js';
import type { DeviceStore } from './types.js';

/** Looks up devices in the database, newest registration first, and forgets ones a service rejects. */
export const databaseDeviceStore: DeviceStore = {
  async list(projectId, userId, platform) {
    const rows = await db
      .select({ token: pushDevices.token, platform: pushDevices.platform })
      .from(pushDevices)
      .where(
        and(
          eq(pushDevices.projectId, projectId),
          eq(pushDevices.userId, userId),
          eq(pushDevices.platform, platform),
          eq(pushDevices.active, true)
        )
      )
      .orderBy(pushDevices.lastSeenAt)
      .limit(20);
    return rows.map((row) => ({ token: row.token, platform: row.platform as 'ios' | 'android' }));
  },
  async remove(projectId, token) {
    await db.delete(pushDevices).where(and(eq(pushDevices.projectId, projectId), eq(pushDevices.token, token)));
  },
};

/** Makes `fcm` and `apns` available as integration providers. Safe to call more than once. */
export function registerPushProviders(): void {
  registry.register(new FcmPushProvider(databaseDeviceStore));
  registry.register(new ApnsPushProvider(databaseDeviceStore));
}
