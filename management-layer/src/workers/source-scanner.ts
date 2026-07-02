/**
 * Source Scanner — BullMQ Weekly Scheduler (Sunday 2:00 AM).
 */

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createSourceScanService } from '../services/source-scan.service.js';
import 'dotenv/config';

const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379', 10) };
const queue = new Queue('source-scan', { connection });
const prisma = new PrismaClient();
const scanService = createSourceScanService({ prisma });

async function scanAll(): Promise<void> {
  console.log('[scanner] Starting weekly source scan...');
  const clients = await prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  for (const c of clients) {
    try {
      const results = await scanService.scanAll(c.id);
      const conflicts = results.reduce((s, r) => s + r.conflicts, 0);
      console.log(`[scanner] "${c.name}" → ${conflicts} conflicts`);
    } catch (err) { console.error(`[scanner] Failed "${c.name}":`, err); }
  }
  console.log('[scanner] Complete');
}

async function main(): Promise<void> {
  for (const j of await queue.getRepeatableJobs()) { if (j.name === 'weekly-scan') await queue.removeRepeatableByKey(j.key); }
  await queue.add('weekly-scan', {}, { repeat: { pattern: '0 2 * * 0' } });
  console.log('[scanner] Registered (Sunday 2:00 AM)');
  await scanAll();
}

const worker = new Worker('source-scan', scanAll, {
  connection,
  removeOnComplete: { age: 86400 * 7, count: 50 },
  removeOnFail: { age: 86400 * 30, count: 100 },
  limiter: {
    max: 3,
    duration: 60000,
  },
});
worker.on('completed', (j) => console.log(`[scanner] Job ${j?.id} done`));
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
async function shutdown(s: string): Promise<void> { console.log(`[scanner] ${s}`); await worker.close(); await queue.close(); await prisma.$disconnect(); process.exit(0); }
main();
