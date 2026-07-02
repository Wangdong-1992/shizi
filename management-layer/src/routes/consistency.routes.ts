/**
 * Consistency Routes.
 *
 * GET  /api/v1/consistency/summary   — Overview stats
 * GET  /api/v1/consistency/conflicts — Conflict list
 * POST /api/v1/consistency/scan      — Trigger scan
 * POST /api/v1/consistency/actions   — Create action
 * GET  /api/v1/consistency/actions   — Action list
 * PUT  /api/v1/consistency/actions/:id — Update action
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSourceScanService } from '../services/source-scan.service.js';
import { createConsistencyService } from '../services/consistency.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const actionBodySchema = z.object({
  consistencyId: z.string().min(1, '一致性 ID 不能为空'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  action: z.string().min(1, '行动描述不能为空').max(500),
  note: z.string().max(1000).optional(),
});

const actionIdSchema = z.object({
  id: z.string().min(1, '行动 ID 不能为空'),
});

const actionUpdateSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  action: z.string().min(1).max(500).optional(),
  note: z.string().max(1000).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

export default async function consistencyRoutes(fastify: FastifyInstance): Promise<void> {
  const scanService = createSourceScanService({ prisma: fastify.prisma });
  const cService = createConsistencyService({ prisma: fastify.prisma });

  fastify.addHook('preHandler', [fastify.jwt.verifyJwt, fastify.jwt.requireRole('ADMIN', 'OPERATOR')]);
  function getClientId(request: FastifyRequest): string { const id = request.user?.clientId; if (!id) throw new Error('clientId'); return id; }

  fastify.get('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try { reply.send(successResponse(await cService.getSummary(getClientId(request)))); }
    catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });

  fastify.get('/conflicts', async (request: FastifyRequest, reply: FastifyReply) => {
    try { reply.send(successResponse(await cService.getConflicts(getClientId(request)))); }
    catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });

  fastify.post('/scan', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const results = await scanService.scanAll(getClientId(request));
      reply.send(successResponse(results, '扫描完成'));
    } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });

  fastify.post('/actions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const body = actionBodySchema.parse(request.body as unknown);
      const result = await cService.createAction(body.consistencyId, clientId, {
        priority: body.priority,
        action: body.action,
        note: body.note,
      });
      reply.send(successResponse(result, '行动项已创建'));
    } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });

  fastify.get('/actions', async (request: FastifyRequest, reply: FastifyReply) => {
    try { reply.send(successResponse(await cService.getActions(getClientId(request)))); }
    catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });

  fastify.put('/actions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = actionIdSchema.parse(request.params as unknown);
      const body = actionUpdateSchema.parse(request.body as unknown);
      const result = await cService.updateAction(id, clientId, body);
      reply.send(successResponse(result));
    } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
}
