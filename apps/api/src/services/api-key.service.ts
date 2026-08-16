import crypto from 'crypto';
import { apiKeys, db, organizations, projects } from '@gami/database';
import { and, eq, isNull } from 'drizzle-orm';

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
  scopes: string[] = ['*'],
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
    scopes: (newKey.scopes as string[]) || ['*'],
    expiresAt: newKey.expiresAt,
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

  // Check expiration
  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return null;
  }

  // Asynchronously update last_used_at
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

  // Verify Organization status
  const [org] = await db.select().from(organizations).where(eq(organizations.id, project.organizationId));
  if (!org || org.status === 'suspended') {
    return { key: keyRecord, project, isSuspended: true };
  }

  return { key: keyRecord, project, isSuspended: false };
}
