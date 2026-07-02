/**
 * Import Pipeline Service — 5-Stage State Machine.
 *
 * Stages: pending(0) → collect(1) → clean(2) → structure(3) → verify(4) → review(5) → done
 * Progress: 0% / 20% / 40% / 60% / 80% / 100%
 *
 * Each stage has an AI primary path and a rule-based fallback.
 * AI failure does NOT block the pipeline — fallback continues.
 */

import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { collect, type InputType, type CollectorResult } from '../lib/importers/collector.js';
import { clean, type CleanerResult } from '../lib/importers/cleaner.js';
import { structure, type StructurerResult, type StructuredEntry } from '../lib/importers/structurer.js';
import { verify, type VerifierResult, type VerifiedEntry, type ConflictInfo } from '../lib/importers/verifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportJob {
  /** Unique job ID */
  id: string;
  /** Tenant UUID */
  clientId: string;
  /** Input type */
  inputType: InputType;
  /** File path or URL */
  inputRef: string;
  /** Current stage (0-5) */
  stage: number;
  /** Per-stage output data */
  stageData: Record<string, Record<string, unknown>>;
  /** Overall status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Error message if failed */
  error?: string;
}

export interface ImportProgress {
  jobId: string;
  stage: number;
  stageLabel: string;
  progress: number;
  status: string;
}

export interface ImportReview {
  jobId: string;
  entries: ReviewEntry[];
  globalMissingFields: string[];
  methodPath: {
    collect: string;
    clean: string;
    structure: string;
    verify: string;
  };
}

export interface ReviewEntry {
  title: string;
  category: string;
  content: string;
  confidence: number;
  conflicts: ConflictInfo[];
  needsManualReview: boolean;
}

// ---------------------------------------------------------------------------
// Stage Labels
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<number, string> = {
  0: 'pending',
  1: 'collect',
  2: 'clean',
  3: 'structure',
  4: 'verify',
  5: 'review',
};

// ---------------------------------------------------------------------------
// Pipeline Service
// ---------------------------------------------------------------------------

export interface ImportPipelineDeps {
  prisma: PrismaClient;
}

export function createImportPipelineService(deps: ImportPipelineDeps) {
  const { prisma } = deps;

  /**
   * Process an import job through all 5 stages.
   * Called by the BullMQ worker.
   *
   * @param job - The import job
   * @param updateProgress - Callback to update BullMQ job progress
   */
  async function processJob(
    job: ImportJob,
    updateProgress: (value: object) => Promise<void>,
  ): Promise<void> {
    job.status = 'processing';

    try {
      // Stage 1: Collect (20%)
      job.stage = 1;
      await updateProgress({ stage: 1, stageLabel: 'collect', progress: 20 });
      const collectorResult = await collect(job.inputType, job.inputRef);
      job.stageData[STAGE_LABELS[1]] = collectorResult as unknown as Record<string, unknown>;

      // Stage 2: Clean (40%)
      job.stage = 2;
      await updateProgress({ stage: 2, stageLabel: 'clean', progress: 40 });
      const cleanerResult = await clean(collectorResult.rawText);
      job.stageData[STAGE_LABELS[2]] = cleanerResult as unknown as Record<string, unknown>;

      // Stage 3: Structure (60%)
      job.stage = 3;
      await updateProgress({ stage: 3, stageLabel: 'structure', progress: 60 });
      const structurerResult = await structure(cleanerResult.cleanText);
      job.stageData[STAGE_LABELS[3]] = structurerResult as unknown as Record<string, unknown>;

      // Stage 4: Verify (80%)
      job.stage = 4;
      await updateProgress({ stage: 4, stageLabel: 'verify', progress: 80 });
      const verifierResult = await verify(structurerResult.entries);
      job.stageData[STAGE_LABELS[4]] = verifierResult as unknown as Record<string, unknown>;

      // Stage 5: Review (100%)
      job.stage = 5;
      job.status = 'completed';
      await updateProgress({ stage: 5, stageLabel: 'review', progress: 100, status: 'completed' });
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : 'Unknown pipeline error';
      await updateProgress({ stage: job.stage, status: 'failed', error: job.error });
      throw err;
    }
  }

  /**
   * Get the current progress of a completed job (for the API).
   *
   * @param job - The completed ImportJob
   * @returns Progress summary
   */
  function getProgress(job: ImportJob): ImportProgress {
    return {
      jobId: job.id,
      stage: job.stage,
      stageLabel: STAGE_LABELS[job.stage] ?? 'unknown',
      progress: Math.min(job.stage * 20, 100),
      status: job.status,
    };
  }

  /**
   * Get the review results from a completed job.
   *
   * @param job - The completed ImportJob
   * @returns Review entries with conflict annotations
   */
  function getReview(job: ImportJob): ImportReview {
    const structurerData = job.stageData[STAGE_LABELS[3]] as unknown as StructurerResult | undefined;
    const verifierData = job.stageData[STAGE_LABELS[4]] as unknown as VerifierResult | undefined;

    const entries: ReviewEntry[] = (verifierData?.entries ?? structurerData?.entries ?? []).map((e) => {
      const ve = e as VerifiedEntry;
      return {
        title: ve.entry?.title ?? (e as StructuredEntry).title,
        category: ve.entry?.category ?? (e as StructuredEntry).category,
        content: ve.entry?.content ?? (e as StructuredEntry).content,
        confidence: ve.adjustedConfidence ?? (e as StructuredEntry).confidence ?? 0.5,
        conflicts: ve.conflicts ?? [],
        needsManualReview: ve.needsManualReview ?? false,
      };
    });

    return {
      jobId: job.id,
      entries,
      globalMissingFields: verifierData?.globalMissingFields ?? [],
      methodPath: {
        collect: 'collected',
        clean: job.stageData[STAGE_LABELS[2]] ? 'completed' : 'pending',
        structure: job.stageData[STAGE_LABELS[3]] ? 'completed' : 'pending',
        verify: job.stageData[STAGE_LABELS[4]] ? 'completed' : 'pending',
      },
    };
  }

  /**
   * Confirm import: batch-create knowledge entries from the review.
   */
  async function confirmImport(job: ImportJob, clientId: string): Promise<{ created: number }> {
    const review = getReview(job);

    let created = 0;
    for (const entry of review.entries) {
      await prisma.knowledgeEntry.create({
        data: {
          id: randomUUID(),
          clientId,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          confidence: entry.confidence,
          riskLevel: entry.confidence < 0.7 ? 'medium' : (entry.conflicts.length > 0 ? 'high' : 'low'),
          status: 'draft',
          version: 1,
        },
      });
      created++;
    }

    return { created };
  }

  return {
    processJob,
    getProgress,
    getReview,
    confirmImport,
  };
}
