/**
 * Operator Routes (ADMIN only).
 *
 * POST   /api/v1/operators       — Create operator
 * GET    /api/v1/operators       — List operators (paginated)
 * GET    /api/v1/operators/:id   — Get operator by ID
 * PUT    /api/v1/operators/:id   — Update operator
 * DELETE /api/v1/operators/:id   — Deactivate operator (soft delete)
 *
 * All routes require JWT authentication + ADMIN role.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  createOperatorSchema,
  updateOperatorSchema,
  operatorQuerySchema,
} from '../schemas/operator.schema.js';
import { createOperatorService } from '../services/operator.service.js';
import { convertError } from '../utils/error.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

/**
 * Register operator routes.
 *
 * @param fastify - Fastify instance with prisma and jwt decorators
 */
export default async function operatorRoutes(fastify: FastifyInstance): Promise<void> {
  const operatorService = createOperatorService({ prisma: fastify.prisma });

  // All routes require JWT + ADMIN role
  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN'),
  ]);

  // -------------------------------------------------------------------------
  // POST /api/v1/operators — Create operator
  // -------------------------------------------------------------------------
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = createOperatorSchema.parse(request.body);
      const operator = await operatorService.create(input);

      reply.status(201).send(successResponse(operator, '运营商创建成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operators — List operators (paginated)
  // -------------------------------------------------------------------------
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = operatorQuerySchema.parse(request.query);
      const { items, total } = await operatorService.list(query);

      reply.send(paginatedResponse(items, total, query.page, query.pageSize));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/operators/:id — Get operator by ID
  // -------------------------------------------------------------------------
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const operator = await operatorService.getById(id);

      reply.send(successResponse(operator));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /api/v1/operators/:id — Update operator
  // -------------------------------------------------------------------------
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const input = updateOperatorSchema.parse(request.body);
      const operator = await operatorService.update(id, input);

      reply.send(successResponse(operator, '运营商更新成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/operators/:id — Deactivate operator (soft delete)
  // -------------------------------------------------------------------------
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Prevent self-deactivation
      if (request.user && id === request.user.operatorId) {
        reply.status(400).send({
          code: 400,
          data: null,
          message: '不能停用自己的账号',
        });
        return;
      }

      await operatorService.deactivate(id);

      reply.send(successResponse(null, '运营商已停用'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
