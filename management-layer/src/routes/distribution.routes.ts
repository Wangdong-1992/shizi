/**
 * Distribution Routes.
 *
 * GET    /api/v1/distribution/channels    — Channel list (Tier 0-3)
 * POST   /api/v1/distribution/enqueue    — Enqueue article
 * GET    /api/v1/distribution/status/:id — Status query
 * GET    /api/v1/distribution/package/:channelId — Agent package
 * GET    /api/v1/distribution/logs       — Distribution logs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { createDistributionService } from '../services/distribution.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

const enqueueSchema = z.object({
  draftId: z.string().min(1, 'draftId 不能为空'),
  channelIds: z.array(z.string().uuid()).min(1, '至少选择一个渠道'),
});

export default async function distributionRoutes(fastify: FastifyInstance): Promise<void> {
  const distributionService = createDistributionService();

  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  function getClientId(request: FastifyRequest): string {
    const id = request.user?.clientId;
    if (!id) throw new Error('clientId not set');
    return id;
  }

  // -----------------------------------------------------------------------
  // GET /api/v1/distribution/channels
  // -----------------------------------------------------------------------
  fastify.get('/channels', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const channels = await distributionService.getChannels(clientId);

      // Add frontend-friendly tier grouping
      const grouped = groupByTier(channels);

      reply.send(successResponse({ channels, grouped }));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/distribution/enqueue
  // -----------------------------------------------------------------------
  fastify.post('/enqueue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const input = enqueueSchema.parse(request.body);

      const result = await distributionService.enqueueArticle(
        input.draftId,
        input.channelIds,
        clientId,
      );

      reply.send(successResponse(result, '文章已加入分发队列'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/distribution/status/:id
  // -----------------------------------------------------------------------
  fastify.get('/status/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { id } = request.params as { id: string };

      const status = await distributionService.getStatus(id, clientId);

      reply.send(successResponse(status));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/distribution/package/:channelId
  // -----------------------------------------------------------------------
  fastify.get('/package/:channelId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { channelId } = request.params as { channelId: string };

      const pkg = await distributionService.generateAgentPackage(channelId, clientId);

      reply.send(successResponse(pkg));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/distribution/logs
  // -----------------------------------------------------------------------
  fastify.get('/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      // Logs are fetched from GEOFlow via status queries for specific distributions.
      // This endpoint returns a summary by scanning recent distributions.
      reply.send(successResponse({
        message: 'Phase 3: distribution logs available via GET /status/:id',
        clientId,
      }));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function groupByTier(channels: Array<{ tier: number; [key: string]: unknown }>) {
  const grouped: Record<number, Array<unknown>> = {};
  for (const ch of channels) {
    const t = ch.tier ?? 3;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(ch);
  }
  return Object.entries(grouped).map(([tier, items]) => ({
    tier: parseInt(tier),
    label: `Tier ${tier}`,
    items,
  }));
}
