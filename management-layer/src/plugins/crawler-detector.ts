/**
 * AI Crawler Detector — Fastify Plugin.
 *
 * onRequest hook: detects known AI crawlers by User-Agent regex matching.
 * onResponse hook: enqueues crawler visit to BullMQ for reliable persistence.
 *
 * Supported crawlers: GPTBot, Googlebot, ClaudeBot, Bytespider, Bingbot, CCBot.
 * IPs are anonymized to /24 subnet before logging.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';

const CRAWLER_PATTERNS: Record<string, RegExp> = {
  gptbot: /GPTBot/i,
  googlebot: /Googlebot/i,
  claudebot: /ClaudeBot|anthropic/i,
  bytespider: /Bytespider/i,
  bingbot: /bingbot/i,
  commoncrawl: /CCBot/i,
};

function detectCrawler(ua: string): string | null {
  if (!ua) return null;
  for (const [name, pattern] of Object.entries(CRAWLER_PATTERNS)) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function anonymizeIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return ip;
}

export default fp(async (fastify: FastifyInstance) => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };
  const crawlerLogQueue = new Queue('crawler-log', { connection });

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const ua = request.headers['user-agent'] ?? '';
    if (!ua) return;

    let crawler = detectCrawler(ua);
    if (!crawler && /bot|spider|crawler|scraper/i.test(ua)) {
      crawler = 'other';
    }
    if (!crawler) return;

    (request as any)._crawlerName = crawler;
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const crawler = (request as any)._crawlerName as string | undefined;
    if (!crawler) return;

    const ua = ((request.headers['user-agent'] ?? '') as string).slice(0, 500);
    const ip = request.ip ? anonymizeIp(request.ip) : null;
    const path = request.url.slice(0, 500);
    const statusCode = reply.statusCode;
    const clientId = (request as any).user?.clientId as string | undefined;

    // Enqueue for reliable persistence via BullMQ worker
    await crawlerLogQueue.add('log-crawler', {
      clientId: clientId ?? '00000000-0000-0000-0000-000000000000',
      crawler,
      ua,
      path,
      ip,
      statusCode,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }).catch((err: Error) => {
      fastify.log.warn({ err }, '[crawler-detector] Failed to enqueue crawler log');
    });
  });

  fastify.addHook('onClose', async () => {
    await crawlerLogQueue.close();
  });
}, { name: 'crawler-detector' });
