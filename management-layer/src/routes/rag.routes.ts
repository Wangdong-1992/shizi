/**
 * RAG Routes.
 *
 * POST /api/v1/rag/search   — Four-way hybrid recall + governance filter
 * POST /api/v1/rag/reindex  — Rebuild text search index + verify embeddings
 *
 * All routes require JWT authentication (OPERATOR+).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { ragSearchSchema, ragReindexSchema } from '../schemas/rag.schema.js';
import { createRagService } from '../services/rag.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

export default async function ragRoutes(fastify: FastifyInstance): Promise<void> {
  const ragService = createRagService({ prisma: fastify.prisma });

  // All routes require JWT + OPERATOR or ADMIN
  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  // Helper: extract clientId from JWT
  function getClientId(request: FastifyRequest): string {
    const clientId = request.user?.clientId;
    if (!clientId) {
      throw new Error('clientId not set in JWT — Phase 1 limitation');
    }
    return clientId;
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/rag/search — Four-way hybrid recall
  // ---------------------------------------------------------------------------
  fastify.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const input = ragSearchSchema.parse({ ...(request.body as object), clientId });

      const result = await ragService.retrieve(clientId, input.query, {
        limit: input.limit,
      });

      reply.send(successResponse(result, '检索完成'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/rag/reindex — Rebuild index + verify embeddings
  // ---------------------------------------------------------------------------
  fastify.post('/reindex', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);

      const result = await ragService.reindex(clientId);

      reply.send(successResponse(result, '索引重建完成'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
