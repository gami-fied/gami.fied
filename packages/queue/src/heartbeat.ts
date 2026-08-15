import crypto from 'crypto';
import { getRedisConnection } from './client.js';

export interface WorkerHeartbeatPayload {
  workerId: string;
  timestamp: string;
  status: 'alive' | 'stopping';
  lastProcessedAt: string | null;
  processedCount: number;
}

const WORKER_ID = `worker_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const HEARTBEAT_TTL_SECONDS = 30;
let heartbeatTimer: NodeJS.Timeout | null = null;
let lastProcessedTimestamp: string | null = null;
let totalProcessedCounter = 0;

export function recordWorkerActivity(): void {
  lastProcessedTimestamp = new Date().toISOString();
  totalProcessedCounter++;
}

export async function sendWorkerHeartbeat(status: 'alive' | 'stopping' = 'alive'): Promise<void> {
  try {
    const redis = getRedisConnection();
    const payload: WorkerHeartbeatPayload = {
      workerId: WORKER_ID,
      timestamp: new Date().toISOString(),
      status,
      lastProcessedAt: lastProcessedTimestamp,
      processedCount: totalProcessedCounter,
    };

    const key = `gami:worker:heartbeat:${WORKER_ID}`;
    await redis.set(key, JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS);
    await redis.set('gami:worker:latest_heartbeat', JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS);
  } catch (err) {
    // Fail-safe: Heartbeat error should not crash worker
    console.error('[WorkerHeartbeat] Failed to record heartbeat:', (err as Error).message);
  }
}

export function startWorkerHeartbeat(intervalMs = 5000): void {
  if (heartbeatTimer) return;
  sendWorkerHeartbeat('alive').catch(() => {});
  heartbeatTimer = setInterval(() => {
    sendWorkerHeartbeat('alive').catch(() => {});
  }, intervalMs);
}

export function stopWorkerHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  sendWorkerHeartbeat('stopping').catch(() => {});
}

export async function getWorkerHeartbeatStatus(): Promise<{
  alive: boolean;
  status: 'healthy' | 'stale' | 'down';
  heartbeat: WorkerHeartbeatPayload | null;
}> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get('gami:worker:latest_heartbeat');
    if (!raw) {
      return { alive: false, status: 'down', heartbeat: null };
    }

    const payload: WorkerHeartbeatPayload = JSON.parse(raw);
    const ageMs = Date.now() - new Date(payload.timestamp).getTime();

    // Heartbeat must be within 15 seconds and status 'alive'
    if (payload.status === 'alive' && ageMs <= 15000) {
      return { alive: true, status: 'healthy', heartbeat: payload };
    } else {
      return { alive: false, status: 'stale', heartbeat: payload };
    }
  } catch {
    return { alive: false, status: 'down', heartbeat: null };
  }
}
