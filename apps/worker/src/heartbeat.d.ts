export interface WorkerHeartbeatPayload {
    workerId: string;
    timestamp: string;
    status: 'alive' | 'stopping';
    lastProcessedAt: string | null;
    processedCount: number;
}
export declare function recordWorkerActivity(): void;
export declare function sendWorkerHeartbeat(status?: 'alive' | 'stopping'): Promise<void>;
export declare function startWorkerHeartbeat(intervalMs?: number): void;
export declare function stopWorkerHeartbeat(): void;
export declare function getWorkerHeartbeatStatus(): Promise<{
    alive: boolean;
    status: 'healthy' | 'stale' | 'down';
    heartbeat: WorkerHeartbeatPayload | null;
}>;
//# sourceMappingURL=heartbeat.d.ts.map