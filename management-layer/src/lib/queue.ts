/**
 * BullMQ Queue Initialization.
 *
 * Creates Redis-backed job queues for async processing:
 *   - kb-import: Knowledge base import pipeline (T2.3)
 *   - content-generation: AI content generation (T2.4)
 *
 * Redis connection is shared across all queues.
 * Uses ioredis for full Redis protocol support (BullMQ requirement).
 */

import { Queue, Worker, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

/**
 * Shared Redis connection for BullMQ.
 * maxRetriesPerRequest: null is REQUIRED by BullMQ.
 */
const connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
  retryStrategy(times: number): number | null {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 200, 5000);
  },
});

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

/** Knowledge base import queue (5-stage pipeline). */
export const importQueue = new Queue('kb-import', { connection });

/** Content generation queue (used by T2.4). */
export const generationQueue = new Queue('content-generation', { connection });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add a job to the import queue.
 *
 * @param name - Job name for monitoring
 * @param data - Job payload (ImportJob data)
 * @param opts - Optional BullMQ job options
 * @returns The created job
 */
export async function enqueueImportJob(
  name: string,
  data: Record<string, unknown>,
  opts?: JobsOptions,
) {
  return importQueue.add(name, data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 * 24 }, // Keep completed jobs for 24h
    removeOnFail: { age: 3600 * 24 * 7 }, // Keep failed jobs for 7 days
    ...opts,
  });
}

/**
 * Create a worker for the import queue.
 *
 * @param processor - Async job processor function
 * @returns BullMQ Worker instance
 */
export function createImportWorker(
  processor: (job: { id: string; data: Record<string, unknown>; updateProgress: (value: object) => Promise<void> }) => Promise<void>,
): Worker {
  const worker = new Worker('kb-import', async (job) => {
    await processor({
      id: job.id ?? 'unknown',
      data: job.data as Record<string, unknown>,
      updateProgress: async (value: object) => {
        await job.updateProgress(value);
      },
    });
  }, { connection });

  worker.on('completed', (job) => {
    console.log(`[worker] Import job ${job?.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Import job ${job?.id} failed:`, err?.message);
  });

  return worker;
}

/**
 * Check Redis connection health.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await connection.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully close all connections.
 */
export async function closeQueue(): Promise<void> {
  await importQueue.close();
  await generationQueue.close();
  await connection.quit();
}
