/**
 * Review Routes.
 *
 * POST /api/v1/review/:draftId/submit — Submit 6-dimension checklist review
 * GET  /api/v1/review/:draftId        — Get review history
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { createReviewService } from '../services/review.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

const checklistItemSchema = z.object({
  passed: z.boolean(),
  reason: z.string().optional(),
});

const submitReviewSchema = z.object({
  checklist: z.object({
    accuracy: checklistItemSchema,
    gain: checklistItemSchema,
    brand: checklistItemSchema,
    compliance: checklistItemSchema,
    eeat: checklistItemSchema,
    readability: checklistItemSchema,
  }),
  signature: z.string().min(1, '签名不能为空'),
});

export default async function reviewRoutes(fastify: FastifyInstance): Promise<void> {
  const reviewService = createReviewService({ prisma: fastify.prisma });

  fastify.addHook('preHandler', [
    fastify.jwt.verifyJwt,
    fastify.jwt.requireRole('ADMIN', 'OPERATOR'),
  ]);

  function getOperatorId(request: FastifyRequest): string {
    return request.user?.operatorId ?? 'unknown';
  }

  function getClientId(request: FastifyRequest): string {
    return request.user?.clientId ?? '';
  }

  // -----------------------------------------------------------------------
  // POST /api/v1/review/:draftId/submit
  // -----------------------------------------------------------------------
  fastify.post('/:draftId/submit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const operatorId = getOperatorId(request);
      const clientId = getClientId(request);
      const { draftId } = request.params as { draftId: string };
      const input = submitReviewSchema.parse(request.body);

      const result = await reviewService.submitReview(
        draftId,
        clientId,
        operatorId,
        input.checklist,
        input.signature,
      );

      reply.send(successResponse(result, result.passed ? '审核通过' : '审核未通过，已记录原因'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/review/:draftId
  // -----------------------------------------------------------------------
  fastify.get('/:draftId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { draftId } = request.params as { draftId: string };

      const reviews = await reviewService.getReviews(draftId);

      reply.send(successResponse(reviews));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });
}
