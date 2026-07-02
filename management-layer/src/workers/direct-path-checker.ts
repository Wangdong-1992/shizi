/**
 * Direct Path Checker — BullMQ Daily Scheduler.
 *
 * Runs daily at 6:00 AM to check HTTP status of all direct paths
 * for all active clients.
 *
 * Start with: npm run worker:direct-path
 */

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createDirectPathService } from '../services/direct-path.service.js';

import 'dotenv/config';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const queue = new Queue('direct-path-check', { connection });
const prisma = new PrismaClient();
const dpService = createDirectPathService({ prisma });

async function checkAllClients(): Promise<void> {
  console.log('[scheduler] Starting daily direct path check...');
  const clients = await prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  console.log(`[scheduler] Checking ${clients.length} active clients`);

  for (const client of clients) {
    try {
      const results = await dpService.checkAll(client.id);
      const active = results.filter((r) => r.status === 'active').length;
      console.log(`[scheduler] Client "${client.name}" → ${active}/${results.length} active`);
    } catch (err) {
      console.error(`[scheduler] Failed for "${client.name}":`, err);
    }
  }
  console.log('[scheduler] Daily check complete');
}

async function main(): Promise<void> {
  const existing = await queue.getRepeatableJobs();
  for (const j of existing) {
    if (j.name === 'daily-direct-path-check') await queue.removeRepeatableByKey(j.key);
  }
  await queue.add('daily-direct-path-check', {}, {
    repeat: { pattern: '0 6 * * *' },
    removeOnComplete: { age: 86400 * 7 },
  });
  console.log('[scheduler] Daily direct path check registered (6:00 AM)');
  await checkAllClients();
}

const worker = new Worker('direct-path-check', async () => { await checkAllClients(); }, {
  connection,
  removeOnComplete: { age: 86400, count: 50 },
  removeOnFail: { age: 86400 * 7, count: 100 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});
worker.on('completed', (j) => console.log(`[scheduler] Job ${j?.id} done`));
worker.on('failed', (j, err) => console.error(`[scheduler] Job ${j?.id} failed:`, err?.message));

async function shutdown(sig: string): Promise<void> {
  console.log(`[scheduler] ${sig}, shutting down...`);
  await worker.close(); await queue.close(); await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
