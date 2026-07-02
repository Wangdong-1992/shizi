/**
 * Content Routes.
 *
 * POST   /api/v1/content/generate — Create draft + enqueue AI generation
 * GET    /api/v1/content          — List drafts (paginated, filterable)
 * GET    /api/v1/content/:id      — Get draft (with reviews)
 * PUT    /api/v1/content/:id      — Edit draft (draft/rejected only)
 * DELETE /api/v1/content/:id      — Delete draft
 * GET    /api/v1/content/:id/generation-status — Check generation status
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { generationQueue } from '../lib/queue.js';
import { createContentGenerationService } from '../services/content-generation.service.js';
import { convertError } from '../utils/error.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

const createSchema = z.object({
  title: z.string().min(5, '标题至少 5 字').max(100, '标题不能超过 100 字'),
  format: z.enum(['qa', 'article']).default('qa'),
});

const updateSchema = z.object({
  title: z.string().min(5).max(100).optional(),
  content: z.string().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['draft', 'generating', 'review', 'approved', 'rejected']).optional(),
});

export default async function contentRoutes(fastify: FastifyInstance): Promise<void> {
  const contentService = createContentGenerationService({ prisma: fastify.prisma });

  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  function getClientId(request: FastifyRequest): string {
    const id = request.user?.clientId;
    if (!id) throw new Error('clientId not set in JWT');
    return id;
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/content/generate — Create + enqueue
  // -----------------------------------------------------------------------
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const input = createSchema.parse(request.body);

      const draft = await contentService.createDraft(clientId, input);

      // Enqueue generation job
      await generationQueue.add('content-generation', {
        draftId: draft.id,
        clientId,
      });

      reply.status(201).send(successResponse(
        { id: draft.id, status: draft.status, title: draft.title },
        '内容草稿已创建，AI 正在生成...',
      ));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/content — List drafts
  // -----------------------------------------------------------------------
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const query = listQuerySchema.parse(request.query);
      const { items, total } = await contentService.listDrafts(clientId, query);

      reply.send(paginatedResponse(
        items.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          words: d.words,
          aiRatio: d.aiRatio,
          geoScore: d.geoScore,
          createdAt: d.createdAt.toISOString(),
          latestReview: d.reviews[0] ?? null,
        })),
        total,
        query.page,
        query.pageSize,
      ));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/content/:id — Get draft detail
  // -----------------------------------------------------------------------
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const draft = await contentService.getDraft(id, clientId);

      reply.send(successResponse(draft));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/content/:id — Edit draft
  // -----------------------------------------------------------------------
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const input = updateSchema.parse(request.body);

      const draft = await contentService.updateDraft(id, clientId, input);

      reply.send(successResponse(draft, '草稿已更新'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/content/:id — Delete draft
  // -----------------------------------------------------------------------
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };

      await contentService.deleteDraft(id, clientId);

      reply.send(successResponse(null, '草稿已删除'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/content/:id/generation-status — Poll generation status
  // -----------------------------------------------------------------------
  fastify.get('/:id/generation-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const draft = await contentService.getDraft(id, clientId);

      reply.send(successResponse({
        id: draft.id,
        status: draft.status,
        words: draft.words,
        aiRatio: draft.aiRatio,
        geoScore: draft.geoScore,
      }));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
