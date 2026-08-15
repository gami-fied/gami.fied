import { getRedisConnection } from '@gami/queue';
import crypto from 'crypto';
const WORKER_ID = `worker_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const HEARTBEAT_TTL_SECONDS = 30;
let heartbeatTimer = null;
let lastProcessedTimestamp = null;
let totalProcessedCounter = 0;
export function recordWorkerActivity() {
    lastProcessedTimestamp = new Date().toISOString();
    totalProcessedCounter++;
}
export async function sendWorkerHeartbeat(status = 'alive') {
    try {
        const redis = getRedisConnection();
        const payload = {
            workerId: WORKER_ID,
            timestamp: new Date().toISOString(),
            status,
            lastProcessedAt: lastProcessedTimestamp,
            processedCount: totalProcessedCounter,
        };
        const key = `gami:worker:heartbeat:${WORKER_ID}`;
        await redis.set(key, JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS);
        await redis.set('gami:worker:latest_heartbeat', JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS);
    }
    catch (err) {
        // Fail-safe: Heartbeat error should not crash worker
        console.error('[WorkerHeartbeat] Failed to record heartbeat:', err.message);
    }
}
export function startWorkerHeartbeat(intervalMs = 5000) {
    if (heartbeatTimer)
        return;
    sendWorkerHeartbeat('alive').catch(() => { });
    heartbeatTimer = setInterval(() => {
        sendWorkerHeartbeat('alive').catch(() => { });
    }, intervalMs);
}
export function stopWorkerHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    sendWorkerHeartbeat('stopping').catch(() => { });
}
export async function getWorkerHeartbeatStatus() {
    try {
        const redis = getRedisConnection();
        const raw = await redis.get('gami:worker:latest_heartbeat');
        if (!raw) {
            return { alive: false, status: 'down', heartbeat: null };
        }
        const payload = JSON.parse(raw);
        const ageMs = Date.now() - new Date(payload.timestamp).getTime();
        // Heartbeat must be within 15 seconds and status 'alive'
        if (payload.status === 'alive' && ageMs <= 15000) {
            return { alive: true, status: 'healthy', heartbeat: payload };
        }
        else {
            return { alive: false, status: 'stale', heartbeat: payload };
        }
    }
    catch {
        return { alive: false, status: 'down', heartbeat: null };
    }
}
//# sourceMappingURL=heartbeat.js.map