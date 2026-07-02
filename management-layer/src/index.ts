/**
 * GEO Platform — Management Layer (Fastify Server Entry Point)
 *
 * Server startup sequence:
 *   1. Register @fastify/cors (cross-origin requests)
 *   2. Register @fastify/helmet (security headers)
 *   3. Register @fastify/sensible (error helpers)
 *   4. Register prisma plugin (PrismaClient singleton)
 *   5. Register jwt plugin (sign/verify/auth hook)
 *   6. Register routes:
 *      - /health (public health check)
 *      - /api/v1/auth (login + me)
 *      - /api/v1/operators (ADMIN CRUD)
 *      - /api/v1/clients (OPERATOR+ CRUD)
 *      - /api/v1/knowledge (Knowledge CRUD + publish/unpublish)
 *   7. Set global error handler
 *   8. Listen on 0.0.0.0:3001
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { env, config } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import authRoutes from './routes/auth.routes.js';
import operatorRoutes from './routes/operator.routes.js';
import clientRoutes from './routes/client.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import ragRoutes from './routes/rag.routes.js';
import importRoutes from './routes/import.routes.js';
import contentRoutes from './routes/content.routes.js';
import reviewRoutes from './routes/review.routes.js';
import scoringRoutes from './routes/scoring.routes.js';
import distributionRoutes from './routes/distribution.routes.js';
import directPathRoutes from './routes/direct-path.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import consistencyRoutes from './routes/consistency.routes.js';
import entityRoutes from './routes/entity.routes.js';
import crawlerDetector from './plugins/crawler-detector.js';
import { convertError } from './utils/error.js';

/**
 * Create and configure the Fastify server.
 */
async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(config.isDevelopment
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    },
  });

  // -------------------------------------------------------------------------
  // 1. Core plugins
  // -------------------------------------------------------------------------
  await fastify.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  await fastify.register(sensible);
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: ['/health', '/ready'],
    errorResponseBuilder: (request, context) => ({
      code: 429,
      data: null,
      message: `速率限制: ${context.max} 请求/分钟。您已超过限制，请稍后重试。`,
    }),
  });
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // -------------------------------------------------------------------------
  // 2. Application plugins
  // -------------------------------------------------------------------------
  await fastify.register(prismaPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(crawlerDetector);  // Phase 3: AI crawler detection

  // -------------------------------------------------------------------------
  // 3. Health check (public — no auth required)
  // -------------------------------------------------------------------------
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'management',
      timestamp: new Date().toISOString(),
    };
  });

  // -------------------------------------------------------------------------
  // 4. API routes
  // -------------------------------------------------------------------------
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(operatorRoutes, { prefix: '/operators' });
      await api.register(clientRoutes, { prefix: '/clients' });
      await api.register(knowledgeRoutes, { prefix: '/knowledge' });
      await api.register(ragRoutes, { prefix: '/rag' });
      await api.register(importRoutes, { prefix: '/import' });
      await api.register(contentRoutes, { prefix: '/content' });
      await api.register(reviewRoutes, { prefix: '/review' });
      await api.register(scoringRoutes, { prefix: '/scoring' });
      await api.register(distributionRoutes, { prefix: '/distribution' });
      await api.register(directPathRoutes, { prefix: '/direct-paths' });
      await api.register(monitoringRoutes, { prefix: '/monitoring' });
      await api.register(consistencyRoutes, { prefix: '/consistency' });
      await api.register(entityRoutes, { prefix: '/entity' });
    },
    { prefix: '/api/v1' },
  );

  // -------------------------------------------------------------------------
  // 5. Global error handler
  // -------------------------------------------------------------------------
  fastify.setErrorHandler((error, request, reply) => {
    const { statusCode, response } = convertError(error);

    // Log server errors
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Server error');
    } else if (statusCode >= 400) {
      request.log.warn({ err: error, statusCode }, 'Client error');
    }

    reply.status(statusCode).send(response);
  });

  // -------------------------------------------------------------------------
  // 6. 404 handler
  // -------------------------------------------------------------------------
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: 404,
      data: null,
      message: `路由不存在: ${request.method} ${request.url}`,
    });
  });

  return fastify;
}

/**
 * Start the server.
 */
async function main(): Promise<void> {
  const fastify = await createServer();

  try {
    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });

    fastify.log.info(`🚀 Management layer running at http://${env.HOST}:${env.PORT}`);
    fastify.log.info(`📊 Environment: ${env.NODE_ENV}`);
    fastify.log.info(`🔗 GEOFlow API: ${env.GEOFLOW_API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Management] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Management] SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
main();
