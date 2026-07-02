/**
 * Scoring Routes.
 *
 * POST /api/v1/scoring/calculate  — Trigger GEO score calculation
 * GET  /api/v1/scoring/latest     — Get latest score
 * GET  /api/v1/scoring/history    — Get score history (?limit=)
 * GET  /api/v1/scoring/diagnostic — Diagnostic report
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createScoringService } from '../services/scoring.service.js';
import { createScoreChangeLogService } from '../services/score-change-log.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

export default async function scoringRoutes(fastify: FastifyInstance): Promise<void> {
  const scoringService = createScoringService({ prisma: fastify.prisma });
  const changeLogService = createScoreChangeLogService({ prisma: fastify.prisma });

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
  // POST /api/v1/scoring/calculate
  // -----------------------------------------------------------------------
  fastify.post('/calculate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const score = await scoringService.calculateScore(clientId);
      reply.send(successResponse({
        id: score.id,
        d1: score.d1Intent,
        d2: score.d2Eeat,
        d3: score.d3Reach,
        d4: score.d4Compete,
        d5: score.d5Impact,
        geoScore: score.geoScore,
        version: score.scoreVersion,
        eeat: score.eeat,
        mindMetrics: score.mindMetrics,
      }, '评分计算完成'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/scoring/latest
  // -----------------------------------------------------------------------
  fastify.get('/latest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const score = await scoringService.getLatest(clientId);
      reply.send(successResponse(score));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/scoring/history?limit=12
  // -----------------------------------------------------------------------
  fastify.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(12) }).parse(request.query);
      const history = await scoringService.getHistory(clientId, limit);
      reply.send(successResponse(history));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/scoring/diagnostic
  // -----------------------------------------------------------------------
  fastify.get('/diagnostic', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const diagnostic = await scoringService.getDiagnostic(clientId);
      reply.send(successResponse(diagnostic));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/scoring/calculate-auto (Phase 3)
  // -----------------------------------------------------------------------
  fastify.post('/calculate-auto', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const score = await scoringService.calculateAuto(clientId);
      reply.send(successResponse({
        id: score.id, d1: score.d1Intent, d2: score.d2Eeat, d3: score.d3Reach,
        d4: score.d4Compete, d5: score.d5Impact, geoScore: score.geoScore,
      }, '自动评分完成'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/scoring/changes (Phase 3)
  // -----------------------------------------------------------------------
  fastify.get('/changes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientId = getClientId(request);
      const changes = await changeLogService.getChanges(clientId);
      reply.send(successResponse(changes));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
