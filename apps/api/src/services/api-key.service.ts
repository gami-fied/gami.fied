import crypto from 'crypto';
import { apiKeys, db, projects } from '@gami/database';
import { eq, and, isNull } from 'drizzle-orm';

export interface GeneratedApiKey {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  rawSecret: string;
  createdAt: Date;
}

export function hashApiKey(rawSecret: string): string {
  return crypto.createHash('sha256').update(rawSecret).digest('hex');
}

export async function createApiKey(projectId: string, name: string): Promise<GeneratedApiKey> {
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
    createdAt: newKey.createdAt,
  };
}

export async function authenticateApiKey(rawSecret: string) {
  if (!rawSecret || !rawSecret.startsWith('gami_live_')) {
    return null;
  }

  const keyHash = hashApiKey(rawSecret);

  const [keyRecord] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));

  if (!keyRecord) {
    return null;
  }

  // Update last_used_at async
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id))
    .catch(() => {
      // Ignore background update errors
    });

  const [project] = await db.select().from(projects).where(eq(projects.id, keyRecord.projectId));

  if (!project) {
    return null;
  }

  return { key: keyRecord, project };
}
