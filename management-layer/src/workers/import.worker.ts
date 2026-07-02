/**
 * Import Worker — BullMQ Job Processor.
 *
 * Processes kb-import jobs through the 5-stage import pipeline.
 * Runs as a separate process (not in the main Fastify server).
 *
 * Start with: npx tsx src/workers/import.worker.ts
 * Or via package.json: "worker:import": "tsx src/workers/import.worker.ts"
 *
 * The worker handles:
 *   1. Fetching jobs from the BullMQ kb-import queue
 *   2. Processing each job through ImportPipelineService.processJob()
 *   3. Reporting progress updates to the queue
 *   4. Graceful shutdown on SIGTERM/SIGINT
 */

import { PrismaClient } from '@prisma/client';
import { createImportWorker, closeQueue } from '../lib/queue.js';
import { createImportPipelineService, type ImportJob } from '../services/import-pipeline.service.js';

// Load environment variables
import 'dotenv/config';

// ---------------------------------------------------------------------------
// Initialize services
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();
const pipelineService = createImportPipelineService({ prisma });

// ---------------------------------------------------------------------------
// Create Worker
// ---------------------------------------------------------------------------

const worker = createImportWorker(async (job) => {
  const importJob: ImportJob = {
    id: job.id,
    clientId: job.data.clientId as string,
    inputType: job.data.inputType as ImportJob['inputType'],
    inputRef: job.data.inputRef as string,
    stage: (job.data.stage as number) ?? 0,
    stageData: (job.data.stageData as Record<string, Record<string, unknown>>) ?? {},
    status: 'pending',
  };

  console.log(`[worker] Processing import job ${importJob.id} (${importJob.inputType})`);

  await pipelineService.processJob(importJob, async (progress) => {
    await job.updateProgress({
      ...progress,
      stageData: importJob.stageData,
      status: importJob.status,
    });
  });

  // Store the completed job data back (for API queries)
  await job.updateProgress({
    status: 'completed',
    stageData: importJob.stageData,
    stage: importJob.stage,
  });

  console.log(`[worker] Import job ${importJob.id} completed`);
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down...`);
  await worker.close();
  await closeQueue();
  await prisma.$disconnect();
  console.log('[worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] Import worker started, waiting for jobs...');

// Export for programmatic use
export { worker };
