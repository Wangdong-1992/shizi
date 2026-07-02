/**
 * Import Routes.
 *
 * POST   /api/v1/import/upload    — Upload file (PDF/Word) for import
 * POST   /api/v1/import/url       — Submit URL for import
 * GET    /api/v1/import/:jobId/progress — Query import job progress
 * GET    /api/v1/import/:jobId/result   — Get review results
 * POST   /api/v1/import/:jobId/confirm  — Confirm and write entries
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { enqueueImportJob } from '../lib/queue.js';
import { createImportPipelineService, type ImportJob } from '../services/import-pipeline.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

// ---------------------------------------------------------------------------
// In-memory job store (Phase 2 MVP — no persistence for job metadata)
// In production, this would be stored in Redis or PostgreSQL.
// ---------------------------------------------------------------------------

const jobStore = new Map<string, ImportJob>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const urlSchema = z.object({
  url: z.string().url('URL 格式无效'),
});

const jobIdSchema = z.object({
  jobId: z.string().min(1, '任务 ID 不能为空'),
});

const confirmSchema = z.object({
  jobId: z.string().min(1, '任务 ID 不能为空'),
});

export default async function importRoutes(fastify: FastifyInstance): Promise<void> {
  const pipelineService = createImportPipelineService({ prisma: fastify.prisma });

  // All routes require JWT + OPERATOR or ADMIN
  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  function getClientId(request: FastifyRequest): string {
    const clientId = request.user?.clientId;
    if (!clientId) throw new Error('clientId not set in JWT');
    return clientId;
  }

  // Ensure uploads directory exists
  try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); } catch { /* exists */ }

  // ---------------------------------------------------------------------------
  // POST /api/v1/import/upload — Upload file + enqueue import job
  // ---------------------------------------------------------------------------
  fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);

      // Handle multipart file upload
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ code: 400, data: null, message: '未提供文件' });
      }

      const ext = path.extname(data.filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return reply.status(400).send({ code: 400, data: null, message: '仅支持 PDF 和 Word (.docx) 文件' });
      }

      // Save file
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);
      const buffer = await data.toBuffer();
      await fs.writeFile(filePath, buffer);

      // Determine input type
      const inputType = ext === '.pdf' ? 'pdf' : 'word';

      // Create import job
      const job: ImportJob = {
        id: randomUUID(),
        clientId,
        inputType,
        inputRef: filePath,
        stage: 0,
        stageData: {},
        status: 'pending',
      };

      // Store in memory
      jobStore.set(job.id, job);

      // Enqueue BullMQ job
      await enqueueImportJob(`import-${job.id}`, {
        clientId,
        inputType,
        inputRef: filePath,
        stage: 0,
        stageData: {},
      });

      reply.status(201).send(successResponse({ jobId: job.id, filename: data.filename, inputType }, '文件上传成功，已加入导入队列'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/import/url — Submit URL for import
  // ---------------------------------------------------------------------------
  fastify.post('/url', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { url } = urlSchema.parse(request.body as unknown);

      const job: ImportJob = {
        id: randomUUID(),
        clientId,
        inputType: 'url',
        inputRef: url,
        stage: 0,
        stageData: {},
        status: 'pending',
      };

      jobStore.set(job.id, job);

      await enqueueImportJob(`import-${job.id}`, {
        clientId,
        inputType: 'url',
        inputRef: url,
        stage: 0,
        stageData: {},
      });

      reply.status(201).send(successResponse({ jobId: job.id, url }, 'URL 导入任务已创建'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/import/:jobId/progress — Query progress
  // ---------------------------------------------------------------------------
  fastify.get('/:jobId/progress', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = jobIdSchema.parse(request.params as unknown);
      const job = jobStore.get(jobId);

      if (!job) {
        return reply.status(404).send({ code: 404, data: null, message: '导入任务不存在' });
      }

      const progress = pipelineService.getProgress(job);
      reply.send(successResponse(progress));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/import/:jobId/result — Get review results
  // ---------------------------------------------------------------------------
  fastify.get('/:jobId/result', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = jobIdSchema.parse(request.params as unknown);
      const job = jobStore.get(jobId);

      if (!job) {
        return reply.status(404).send({ code: 404, data: null, message: '导入任务不存在' });
      }

      if (job.status !== 'completed') {
        return reply.status(400).send({ code: 400, data: null, message: '导入任务尚未完成' });
      }

      const review = pipelineService.getReview(job);
      reply.send(successResponse(review));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/import/:jobId/confirm — Confirm and write entries
  // ---------------------------------------------------------------------------
  fastify.post('/:jobId/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { jobId } = confirmSchema.parse(request.body as unknown);
      const job = jobStore.get(jobId);

      if (!job) {
        return reply.status(404).send({ code: 404, data: null, message: '导入任务不存在' });
      }

      if (job.status !== 'completed') {
        return reply.status(400).send({ code: 400, data: null, message: '导入任务尚未完成' });
      }

      const { created } = await pipelineService.confirmImport(job, clientId);

      reply.send(successResponse({ created }, `成功创建 ${created} 个知识条目`));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
