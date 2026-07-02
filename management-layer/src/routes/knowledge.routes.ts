/**
 * Knowledge Routes.
 *
 * POST   /api/v1/knowledge           — Create entry (OPERATOR+)
 * GET    /api/v1/knowledge           — List entries (paginated, filterable)
 * GET    /api/v1/knowledge/categories — Category statistics
 * GET    /api/v1/knowledge/:id       — Get entry by ID
 * PUT    /api/v1/knowledge/:id       — Update entry
 * DELETE /api/v1/knowledge/:id       — Delete entry
 * POST   /api/v1/knowledge/:id/publish   — Publish (chunk+embed+sync)
 * POST   /api/v1/knowledge/:id/unpublish — Unpublish (delete chunks)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { createKnowledgeSchema, updateKnowledgeSchema, knowledgeQuerySchema } from '../schemas/knowledge.schema.js';
import { createKnowledgeService } from '../services/knowledge.service.js';
import { convertError } from '../utils/error.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

export default async function knowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  const knowledgeService = createKnowledgeService({ prisma: fastify.prisma });

  // All routes require JWT + OPERATOR or ADMIN role
  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  // Helper: extract clientId from request (set by verifyJwt)
  function getClientId(request: FastifyRequest): string {
    const clientId = request.user?.clientId;
    if (!clientId) {
      throw new Error('clientId not set in JWT — Phase 1 limitation');
    }
    return clientId;
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/knowledge/categories — must be before /:id to avoid route conflict
  // ---------------------------------------------------------------------------
  fastify.get('/categories', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const stats = await knowledgeService.getCategories(clientId);
      reply.send(successResponse(stats));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/knowledge — Create entry
  // ---------------------------------------------------------------------------
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const input = createKnowledgeSchema.parse(request.body);
      const entry = await knowledgeService.create(input, clientId);

      reply.status(201).send(successResponse(entry, '知识条目创建成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/knowledge — List entries
  // ---------------------------------------------------------------------------
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const query = knowledgeQuerySchema.parse(request.query);
      const { items, total } = await knowledgeService.list(query, clientId);

      reply.send(paginatedResponse(items, total, query.page, query.pageSize));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/knowledge/:id — Get entry by ID
  // ---------------------------------------------------------------------------
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const entry = await knowledgeService.getById(id, clientId);

      reply.send(successResponse(entry));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/v1/knowledge/:id — Update entry
  // ---------------------------------------------------------------------------
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const input = updateKnowledgeSchema.parse(request.body);
      const entry = await knowledgeService.update(id, clientId, input);

      reply.send(successResponse(entry, '知识条目更新成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/knowledge/:id — Delete entry
  // ---------------------------------------------------------------------------
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      await knowledgeService.remove(id, clientId);

      reply.send(successResponse(null, '知识条目已删除'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/knowledge/:id/publish — Publish (chunk + embed + sync)
  // ---------------------------------------------------------------------------
  fastify.post('/:id/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const entry = await knowledgeService.publish(id, clientId);

      reply.send(successResponse(entry, '知识条目发布成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/knowledge/:id/unpublish — Unpublish (delete chunks)
  // ---------------------------------------------------------------------------
  fastify.post('/:id/unpublish', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const entry = await knowledgeService.unpublish(id, clientId);

      reply.send(successResponse(entry, '知识条目已取消发布'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
