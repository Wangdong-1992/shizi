/**
 * Direct Path Routes.
 *
 * GET    /api/v1/direct-paths          — All paths with status
 * PUT    /api/v1/direct-paths/:id      — Update path (url/status)
 * POST   /api/v1/direct-paths/:id/check — Manual single check
 * POST   /api/v1/direct-paths/check-all  — Manual full check
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createDirectPathService } from '../services/direct-path.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

const updateSchema = z.object({
  url: z.string().optional(),
  status: z.enum(['pending', 'active', 'error', 'not_applicable']).optional(),
  errorMessage: z.string().optional(),
});

export default async function directPathRoutes(fastify: FastifyInstance): Promise<void> {
  const dpService = createDirectPathService({ prisma: fastify.prisma });

  fastify.addHook('preHandler', [fastify.jwt.verifyJwt, fastify.jwt.requireRole('ADMIN', 'OPERATOR')]);

  function getClientId(request: FastifyRequest): string {
    const id = request.user?.clientId;
    if (!id) throw new Error('clientId not set');
    return id;
  }

  // GET all
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paths = await dpService.getPaths(getClientId(request));
      reply.send(successResponse(paths));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // PUT update
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const input = updateSchema.parse(request.body);
      const result = await dpService.updatePath(id, clientId, input);
      reply.send(successResponse(result));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // POST single check
  fastify.post('/:id/check', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };
      const path = await dpService.getPaths(clientId);
      const found = path.find((p) => p.id === id);
      if (!found) { reply.status(404).send({ code: 404, data: null, message: '路径不存在' }); return; }
      const result = await dpService.checkPath(clientId, found.pathType);
      reply.send(successResponse(result));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // POST check all
  fastify.post('/check-all', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const results = await dpService.checkAll(clientId);
      reply.send(successResponse(results, '全部检测完成'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
