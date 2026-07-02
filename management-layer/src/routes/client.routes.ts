/**
 * Client Routes (OPERATOR+ access).
 *
 * POST   /api/v1/clients       — Create client
 * GET    /api/v1/clients       — List clients (paginated)
 * GET    /api/v1/clients/:id   — Get client by ID
 * PUT    /api/v1/clients/:id   — Update client
 * DELETE /api/v1/clients/:id   — Deactivate client (soft delete)
 *
 * All routes require JWT authentication. Both ADMIN and OPERATOR roles
 * can access these endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  createClientSchema,
  updateClientSchema,
  clientQuerySchema,
} from '../schemas/client.schema.js';
import { createClientService } from '../services/client.service.js';
import { convertError } from '../utils/error.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

/**
 * Register client routes.
 *
 * @param fastify - Fastify instance with prisma and jwt decorators
 */
export default async function clientRoutes(fastify: FastifyInstance): Promise<void> {
  const clientService = createClientService({ prisma: fastify.prisma });

  // All routes require JWT + OPERATOR or ADMIN role
  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  // -------------------------------------------------------------------------
  // POST /api/v1/clients — Create client
  // -------------------------------------------------------------------------
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = createClientSchema.parse(request.body);
      const client = await clientService.create(input);

      reply.status(201).send(successResponse(client, '客户创建成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/clients — List clients (paginated)
  // -------------------------------------------------------------------------
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = clientQuerySchema.parse(request.query);
      const { items, total } = await clientService.list(query);

      reply.send(paginatedResponse(items, total, query.page, query.pageSize));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/clients/:id — Get client by ID
  // -------------------------------------------------------------------------
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const client = await clientService.getById(id);

      reply.send(successResponse(client));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /api/v1/clients/:id — Update client
  // -------------------------------------------------------------------------
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const input = updateClientSchema.parse(request.body);
      const client = await clientService.update(id, input);

      reply.send(successResponse(client, '客户更新成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/clients/:id — Deactivate client (soft delete)
  // -------------------------------------------------------------------------
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      await clientService.deactivate(id);

      reply.send(successResponse(null, '客户已停用'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
