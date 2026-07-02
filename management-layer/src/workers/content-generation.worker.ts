/**
 * Content Generation Worker — BullMQ Job Processor.
 *
 * Processes content-generation queue jobs through the AI generation pipeline.
 * Runs as a separate process.
 *
 * Start with: npm run worker:generation
 */

import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import { createContentGenerationService } from '../services/content-generation.service.js';

import 'dotenv/config';

const prisma = new PrismaClient();
const generationService = createContentGenerationService({ prisma });

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const worker = new Worker('content-generation', async (job) => {
  const { draftId, clientId } = job.data as { draftId: string; clientId: string };

  console.log(`[worker] Generating content for draft ${draftId}`);
  await generationService.generateContent(draftId, clientId);
  console.log(`[worker] Content generation complete for draft ${draftId}`);
}, {
  connection,
  concurrency: 2,
  removeOnComplete: { age: 86400, count: 100 },
  removeOnFail: { age: 86400 * 7, count: 200 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});

worker.on('completed', (job) => {
  console.log(`[worker] Generation job ${job?.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] Generation job ${job?.id} failed:`, err?.message);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down...`);
  await worker.close();
  await prisma.$disconnect();
  console.log('[worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] Content generation worker started, waiting for jobs...');
