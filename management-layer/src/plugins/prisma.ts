/**
 * Prisma Client Fastify Plugin.
 *
 * Creates a singleton PrismaClient instance and decorates the Fastify
 * instance with `app.prisma`.
 *
 * In development, enables Prisma query logging for debugging.
 */

import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';

import { env, config } from '../config/env.js';

/**
 * Extended PrismaClient with logging configuration.
 */
const prismaClient = new PrismaClient({
  log: config.isDevelopment
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

/**
 * Fastify plugin that decorates the instance with a PrismaClient.
 *
 * Uses fastify-plugin to avoid encapsulation — the decorator is available
 * to all route handlers registered after this plugin.
 */
export default fp(async (fastify) => {
  await prismaClient.$connect();

  fastify.decorate('prisma', prismaClient);

  fastify.addHook('onClose', async () => {
    await prismaClient.$disconnect();
  });
}, {
  name: 'prisma',
});

/**
 * TypeScript augmentation for FastifyInstance.
 * Allows `fastify.prisma` to be type-checked.
 */
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
