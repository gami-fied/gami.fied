import crypto from 'crypto';
import { apiKeys, db, organizations, projects } from '@gami/database';
import { and, eq, isNull } from 'drizzle-orm';
import { DEFAULT_API_KEY_SCOPES } from '../authorization/permissions.js';

export interface GeneratedApiKey {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  rawSecret: string;
  scopes: string[];
  expiresAt?: Date | null;
  createdAt: Date;
}

export function hashApiKey(rawSecret: string): string {
  return crypto.createHash('sha256').update(rawSecret).digest('hex');
}

export async function createApiKey(
  projectId: string,
  name: string,
  scopes: string[] = DEFAULT_API_KEY_SCOPES,
  expiresAt?: Date | null
): Promise<GeneratedApiKey> {
  const secretBytes = crypto.randomBytes(32).toString('hex');
  const rawSecret = `gami_live_${secretBytes}`;
  const keyPrefix = rawSecret.substring(0, 18);
  const keyHash = hashApiKey(rawSecret);

  const keyId = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const [newKey] = await db
    .insert(apiKeys)
    .values({
      id: keyId,
      projectId,
      name,
      keyPrefix,
      keyHash,
      scopes,
      expiresAt: expiresAt || null,
    })
    .returning();

  if (!newKey) {
    throw new Error('Failed to insert API key record');
  }

  return {
    id: newKey.id,
    projectId: newKey.projectId,
    name: newKey.name,
    keyPrefix: newKey.keyPrefix,
    rawSecret,
    scopes: newKey.scopes as string[],
    expiresAt: newKey.expiresAt,
    createdAt: newKey.createdAt,
  };
}

/** How stale `last_used_at` may get. Writing it on every request costs more than it tells anyone. */
const LAST_USED_REFRESH_MS = 60_000;

export async function authenticateApiKey(rawSecret: string) {
  if (!rawSecret || !rawSecret.startsWith('gami_live_')) {
    return null;
  }

  const keyHash = hashApiKey(rawSecret);

  // One query for the key, its project and the organization's status. Every API call starts here.
  const [row] = await db
    .select({ key: apiKeys, project: projects, organizationStatus: organizations.status })
    .from(apiKeys)
    .innerJoin(projects, eq(projects.id, apiKeys.projectId))
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));

  if (!row) {
    return null;
  }

  const { key, project, organizationStatus } = row;

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return null;
  }

  const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
  if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {
        // A failed update only makes "last used" a little stale.
      });
  }

  return { key, project, isSuspended: organizationStatus === 'suspended' };
}
