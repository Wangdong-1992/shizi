/**
 * Auth Routes.
 *
 * POST /api/v1/auth/login  — Login with email/password, returns JWT + sets HttpOnly cookie
 * GET  /api/v1/auth/me     — Get current authenticated user (requires JWT)
 * POST /api/v1/auth/logout — Clear authentication cookie
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { loginSchema } from '../schemas/auth.schema.js';
import { createAuthService } from '../services/auth.service.js';
import { convertError, AppError } from '../utils/error.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { env } from '../config/env.js';

/**
 * Register auth routes.
 *
 * @param fastify - Fastify instance with prisma and jwt decorators
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = createAuthService({ prisma: fastify.prisma });

  // -------------------------------------------------------------------------
  // POST /api/v1/auth/login
  // P0-8 FIX: Sets HttpOnly cookie in addition to returning token in body
  // -------------------------------------------------------------------------
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = loginSchema.parse(request.body);

      const result = await authService.login(input);

      // P0-8 FIX: Set HttpOnly cookie for XSS protection
      // Build Set-Cookie header manually (avoiding @fastify/cookie dependency)
      const cookieMaxAge = 60 * 60 * 24; // 24 hours in seconds
      const isSecure = env.NODE_ENV === 'production';
      const cookieValue = `geo_token=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieMaxAge}${isSecure ? '; Secure' : ''}`;
      reply.header('Set-Cookie', cookieValue);

      reply.send(successResponse(result, '登录成功'));
    } catch (error) {
      const { statusCode, response } = convertError(error);
      reply.status(statusCode).send(response);
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/auth/logout
  // P0-8 FIX: Clear the HttpOnly cookie on logout
  // -------------------------------------------------------------------------
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // Clear the authentication cookie by setting expired Max-Age
    const isSecure = env.NODE_ENV === 'production';
    const cookieValue = `geo_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`;
    reply.header('Set-Cookie', cookieValue);

    reply.send(successResponse(null, '已退出登录'));
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/auth/me — requires JWT authentication
  // -------------------------------------------------------------------------
  fastify.get(
    '/me',
    {
      preHandler: [fastify.jwt.verifyJwt],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.user) {
          throw new AppError(401, '未认证');
        }

        const result = await authService.getMe(
          request.user.operatorId,
          request.user.clientId,
        );

        reply.send(successResponse(result));
      } catch (error) {
        const { statusCode, response } = convertError(error);
        reply.status(statusCode).send(response);
      }
    },
  );
}
