/**
 * Entity Mention Collector — BullMQ Scheduler.
 *
 * Collects brand mentions (20 queries × 4 platforms) every 12 hours
 * for all active clients using AI provider fallback.
 *
 * Start with: npm run worker:mention
 */

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createEntityMentionService } from '../services/entity-mention.service.js';
import 'dotenv/config';

const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379', 10) };
const queue = new Queue('mention-collect', { connection });
const prisma = new PrismaClient();
const mentionService = createEntityMentionService({ prisma });

async function collectAll(): Promise<void> {
  console.log('[mention-collector] Starting mention collection...');
  const clients = await prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  console.log(`[mention-collector] Processing ${clients.length} clients`);

  for (const c of clients) {
    try {
      const result = await mentionService.collectMentions(c.id);
      console.log(`[mention-collector] "${c.name}" → ${result.collected} mentions`);
    } catch (err) {
      console.error(`[mention-collector] Failed "${c.name}":`, err);
    }
  }
  console.log('[mention-collector] Collection complete');
}

async function main(): Promise<void> {
  const jobs = await queue.getRepeatableJobs();
  for (const j of jobs) {
    if (j.name === 'collect-mentions') await queue.removeRepeatableByKey(j.key);
  }
  await queue.add('collect-mentions', {}, {
    repeat: { pattern: '0 */12 * * *' },
    removeOnComplete: { age: 86400 * 7 },
  });
  console.log('[mention-collector] Registered (every 12h)');
  await collectAll();
}

const worker = new Worker('mention-collect', collectAll, {
  connection,
  removeOnComplete: { age: 86400, count: 50 },
  removeOnFail: { age: 86400 * 7, count: 100 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});
worker.on('completed', (j) => console.log(`[mention] Job ${j?.id} done`));
worker.on('failed', (j, err) => console.error(`[mention] Job ${j?.id} failed:`, err?.message));

async function shutdown(s: string): Promise<void> {
  console.log(`[mention] ${s}`); await worker.close(); await queue.close(); await prisma.$disconnect(); process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
main();
