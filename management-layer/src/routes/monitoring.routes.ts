/**
 * Monitoring Routes.
 *
 * GET  /api/v1/monitoring/crawlers?days=7      — Crawler stats
 * GET  /api/v1/monitoring/crawlers/recent       — Recent 50 crawler logs
 * GET  /api/v1/monitoring/mentions              — Mention stats
 * GET  /api/v1/monitoring/mentions/recent       — Recent 20 mentions
 * POST /api/v1/monitoring/mentions/collect      — Manual trigger
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createEntityMentionService } from '../services/entity-mention.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

export default async function monitoringRoutes(fastify: FastifyInstance): Promise<void> {
  const mentionService = createEntityMentionService({ prisma: fastify.prisma });
  const prisma = fastify.prisma;

  fastify.addHook('preHandler', [fastify.jwt.verifyJwt, fastify.jwt.requireRole('ADMIN', 'OPERATOR')]);

  function getClientId(request: FastifyRequest): string {
    const id = request.user?.clientId;
    if (!id) throw new Error('clientId not set');
    return id;
  }

  // -----------------------------------------------------------------------
  // GET /api/v1/monitoring/crawlers?days=7
  // -----------------------------------------------------------------------
  fastify.get('/crawlers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(request.query);
      const since = new Date(Date.now() - days * 86400000);

      const logs = await prisma.aiCrawlerLog.findMany({
        where: { clientId, visitedAt: { gte: since } },
        select: { crawler: true, visitedAt: true },
        orderBy: { visitedAt: 'asc' },
      });

      // Group by crawler + day
      const crawlerTypes = ['gptbot', 'googlebot', 'claudebot', 'bytespider', 'bingbot', 'commoncrawl', 'other'];
      const stats: Record<string, { total: number; daily: Record<string, number> }> = {};
      for (const ct of crawlerTypes) stats[ct] = { total: 0, daily: {} };

      for (const log of logs) {
        const day = log.visitedAt.toISOString().slice(0, 10);
        const crawler = crawlerTypes.includes(log.crawler) ? log.crawler : 'other';
        stats[crawler].total++;
        stats[crawler].daily[day] = (stats[crawler].daily[day] ?? 0) + 1;
      }

      reply.send(successResponse({ days, stats, total: logs.length }));
    } catch (error) {
      const { statusCode, response } = convertError(error); reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/monitoring/crawlers/recent
  // -----------------------------------------------------------------------
  fastify.get('/crawlers/recent', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const logs = await prisma.aiCrawlerLog.findMany({
        where: { clientId },
        orderBy: { visitedAt: 'desc' },
        take: 50,
      });
      reply.send(successResponse(logs));
    } catch (error) {
      const { statusCode, response } = convertError(error); reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/monitoring/mentions
  // -----------------------------------------------------------------------
  fastify.get('/mentions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const stats = await mentionService.getMentionStats(clientId);
      reply.send(successResponse(stats));
    } catch (error) {
      const { statusCode, response } = convertError(error); reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/monitoring/mentions/recent
  // -----------------------------------------------------------------------
  fastify.get('/mentions/recent', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const mentions = await mentionService.getMentions(clientId, { limit: 20 });
      reply.send(successResponse(mentions));
    } catch (error) {
      const { statusCode, response } = convertError(error); reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/monitoring/mentions/collect
  // -----------------------------------------------------------------------
  fastify.post('/mentions/collect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const result = await mentionService.collectMentions(clientId);
      reply.send(successResponse(result, `已采集 ${result.collected} 条提及`));
    } catch (error) {
      const { statusCode, response } = convertError(error); reply.status(statusCode).send(response);
    }
  });
}
