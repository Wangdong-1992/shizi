/**
 * Crawler Log Worker — BullMQ Job Processor.
 *
 * Persists AI crawler visits from the crawler-detector plugin's BullMQ queue
 * to the management_ai_crawler_logs table. This replaces fire-and-forget
 * Prisma writes with reliable queue-based persistence.
 *
 * Start with: npm run worker:crawler
 */

import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379', 10) };

const worker = new Worker('crawler-log', async (job) => {
  const { clientId, crawler, ua, path, ip, statusCode } = job.data as {
    clientId: string; crawler: string; ua: string; path: string; ip: string | null; statusCode: number | null;
  };

  await prisma.aiCrawlerLog.create({
    data: { clientId, crawler, ua, path, ip, statusCode },
  });
}, {
  connection,
  concurrency: 10,
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400 * 7, count: 200 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});

worker.on('completed', () => { /* silent */ });
worker.on('failed', (job, err) => {
  console.error(`[crawler-worker] Job ${job?.id} failed:`, err?.message);
});

async function shutdown(s: string): Promise<void> {
  console.log(`[crawler-worker] ${s}`); await worker.close(); await prisma.$disconnect(); process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[crawler-worker] AI crawler log worker started');
