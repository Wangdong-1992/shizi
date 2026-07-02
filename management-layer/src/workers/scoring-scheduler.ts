/**
 * Scoring Scheduler — Daily Automatic Score Calculation.
 *
 * Registers a BullMQ repeatable job that runs at 3:00 AM daily
 * to recalculate GEO scores for all active clients.
 *
 * Start with: npx tsx src/workers/scoring-scheduler.ts
 */

import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createScoringService } from '../services/scoring.service.js';

import 'dotenv/config';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const scoringQueue = new Queue('scoring', { connection });
const prisma = new PrismaClient();
const scoringService = createScoringService({ prisma });

async function scoreAllClients(): Promise<void> {
  console.log('[scheduler] Starting daily score calculation...');

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`[scheduler] Found ${clients.length} active clients`);

  for (const client of clients) {
    try {
      const score = await scoringService.calculateAuto(client.id);  // Phase 3: auto-score from monitoring data
      console.log(`[scheduler] Client "${client.name}" → GEO ${score.geoScore}`);
    } catch (err) {
      console.error(`[scheduler] Failed for client "${client.name}":`, err);
    }
  }

  console.log('[scheduler] Daily score calculation complete');
}

// Register repeatable job (runs at 3:00 AM)
async function main(): Promise<void> {
  // Remove existing repeatable job if any (idempotent)
  const existing = await scoringQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'daily-scoring') {
      await scoringQueue.removeRepeatableByKey(job.key);
    }
  }

  // Register new repeatable
  await scoringQueue.add('daily-scoring', { allClients: true }, {
    repeat: { pattern: '0 3 * * *' },
    removeOnComplete: { age: 86400 * 7 },
    removeOnFail: { age: 86400 * 30 },
  });

  console.log('[scheduler] Daily scoring job registered (3:00 AM)');

  // Run immediately on first start
  await scoreAllClients();
}

// Handle worker processing
import { Worker } from 'bullmq';

const worker = new Worker('scoring', async (job) => {
  console.log(`[scheduler] Processing scoring job ${job.id}`);
  await scoreAllClients();
}, {
  connection,
  removeOnComplete: { age: 86400, count: 50 },
  removeOnFail: { age: 86400 * 7, count: 100 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});

worker.on('completed', (job) => console.log(`[scheduler] Job ${job?.id} completed`));
worker.on('failed', (job, err) => console.error(`[scheduler] Job ${job?.id} failed:`, err?.message));

async function shutdown(signal: string): Promise<void> {
  console.log(`[scheduler] ${signal} received, shutting down...`);
  await worker.close();
  await scoringQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
