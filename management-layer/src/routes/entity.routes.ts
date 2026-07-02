/**
 * Entity Routes.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createEntityProfileService } from '../services/entity-profile.service.js';
import { convertError } from '../utils/error.js';
import { successResponse } from '../utils/response.js';

export default async function entityRoutes(fastify: FastifyInstance): Promise<void> {
  const eps = createEntityProfileService({ prisma: fastify.prisma });
  fastify.addHook('preHandler', [fastify.jwt.verifyJwt, fastify.jwt.requireRole('ADMIN', 'OPERATOR')]);
  function cid(r: FastifyRequest): string { const id = r.user?.clientId; if (!id) throw new Error('clientId'); return id; }

  fastify.get('/brand-profile', async (req, reply) => {
    try { reply.send(successResponse(await eps.getBrandProfile(cid(req)))); } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
  fastify.get('/org-schema', async (req, reply) => {
    try { reply.send(successResponse(await eps.generateOrgSchema(cid(req)))); } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
  fastify.post('/org-schema/validate', async (req, reply) => {
    try { reply.send(successResponse(await eps.checkSchemaHealth(cid(req)))); } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
  fastify.get('/mentions/trend', async (req, reply) => {
    try {
      const profile = await eps.getBrandProfile(cid(req));
      reply.send(successResponse(profile.visibility.weeklyTrend));
    } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
  fastify.get('/associations', async (req, reply) => {
    try {
      const profile = await eps.getBrandProfile(cid(req));
      reply.send(successResponse(profile.associations));
    } catch (e) { const { statusCode, response } = convertError(e); reply.status(statusCode).send(response); }
  });
}
