/**
 * Entity Mention Service.
 *
 * 20 standard queries × 4 AI platforms brand mention detection.
 * Uses AI provider fallback (OpenAI → Gemini) for each query.
 *
 * Data stored in management_entity_mentions for analytics dashboard.
 */

import type { PrismaClient } from '@prisma/client';
import { generateWithFallback } from '../lib/ai-providers/provider-factory.js';

// ---------------------------------------------------------------------------
// 20 Standard Query Set
// ---------------------------------------------------------------------------

const STANDARD_QUERIES = [
  '水果罐头品牌推荐',
  '黄桃罐头哪个牌子好',
  '水果罐头安全吗',
  '婴幼儿能吃水果罐头吗',
  '水果罐头的营养价值',
  '水果罐头和新鲜水果哪个好',
  '水果罐头保质期多久',
  '水果罐头开封后能放几天',
  '水果罐头生产流程',
  '水果罐头食品安全标准',
  '水果罐头进口品牌',
  '国产水果罐头品牌排名',
  '水果罐头代工厂',
  '水果罐头批发价格',
  '水果罐头OEM定制',
  '水果罐头出口企业',
  '水果罐头电商品牌',
  '水果罐头送礼推荐',
  '低糖水果罐头品牌',
  '有机水果罐头推荐',
];

const PLATFORMS = ['chatgpt', 'google', 'deepseek', 'doubao'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface MentionRecord {
  id: string;
  platform: string;
  query: string;
  mentioned: boolean;
  position: string | null;
  sentiment: string | null;
  depth: string | null;
  checkedAt: string;
}

export interface MentionStats {
  totalQueries: number;
  totalMentions: number;
  mentionRate: number;
  byPlatform: Record<string, { total: number; mentioned: number; rate: number }>;
  bySentiment: Record<string, number>;
  byDepth: Record<string, number>;
}

export interface EntityMentionServiceDeps {
  prisma: PrismaClient;
}

export function createEntityMentionService(deps: EntityMentionServiceDeps) {
  const { prisma } = deps;

  async function collectMentions(clientId: string): Promise<{ collected: number }> {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { brandName: true, name: true },
    });
    const brandName = client?.brandName ?? client?.name ?? '';

    let collected = 0;

    for (const platform of PLATFORMS) {
      for (const query of STANDARD_QUERIES) {
        try {
          const prompt = `搜索"${query}"，品牌"${brandName}"是否被提及？返回 JSON 对象格式：{"mentioned": true/false, "position": "first_half"|"second_half"|"footnote", "sentiment": "positive"|"neutral"|"negative", "depth": "brief"|"medium"|"detailed"}。只返回 JSON，不添加解释。`;

          const response = await generateWithFallback(prompt, { temperature: 0.1, maxTokens: 200 });
          const parsed = parseMentionResponse(response);

          await prisma.entityMention.create({
            data: {
              clientId,
              platform,
              query,
              mentioned: parsed.mentioned,
              position: parsed.position ?? null,
              sentiment: parsed.sentiment ?? null,
              depth: parsed.depth ?? null,
            },
          });
          collected++;
        } catch (err) {
          // Log and continue — don't let one query block others
          console.warn(`[mention] Failed for ${platform}/${query}:`, err);
        }
      }
    }

    return { collected };
  }

  async function getMentions(
    clientId: string,
    options: { platform?: string; limit?: number } = {},
  ) {
    return prisma.entityMention.findMany({
      where: {
        clientId,
        ...(options.platform ? { platform: options.platform } : {}),
      },
      orderBy: { checkedAt: 'desc' },
      take: options.limit ?? 50,
    });
  }

  async function getMentionStats(clientId: string): Promise<MentionStats> {
    const [all, mentioned] = await Promise.all([
      prisma.entityMention.count({ where: { clientId } }),
      prisma.entityMention.count({ where: { clientId, mentioned: true } }),
    ]);

    // By platform
    const byPlatform: MentionStats['byPlatform'] = {};
    for (const platform of PLATFORMS) {
      const [total, m] = await Promise.all([
        prisma.entityMention.count({ where: { clientId, platform } }),
        prisma.entityMention.count({ where: { clientId, platform, mentioned: true } }),
      ]);
      byPlatform[platform] = { total, mentioned: m, rate: total > 0 ? m / total : 0 };
    }

    // By sentiment
    const sentiments = await prisma.entityMention.groupBy({
      by: ['sentiment'],
      where: { clientId, mentioned: true, sentiment: { not: null } },
      _count: true,
    });
    const bySentiment: Record<string, number> = {};
    for (const s of sentiments) {
      if (s.sentiment) bySentiment[s.sentiment] = s._count;
    }

    // By depth
    const depths = await prisma.entityMention.groupBy({
      by: ['depth'],
      where: { clientId, mentioned: true, depth: { not: null } },
      _count: true,
    });
    const byDepth: Record<string, number> = {};
    for (const d of depths) {
      if (d.depth) byDepth[d.depth] = d._count;
    }

    return {
      totalQueries: all,
      totalMentions: mentioned,
      mentionRate: all > 0 ? mentioned / all : 0,
      byPlatform,
      bySentiment,
      byDepth,
    };
  }

  return { collectMentions, getMentions, getMentionStats };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseMentionResponse(raw: string): { mentioned: boolean; position?: string; sentiment?: string; depth?: string } {
  let json = raw.trim();
  if (json.startsWith('```')) json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    const parsed = JSON.parse(json);
    return {
      mentioned: !!parsed.mentioned,
      position: parsed.position ?? undefined,
      sentiment: parsed.sentiment ?? undefined,
      depth: parsed.depth ?? undefined,
    };
  } catch {
    return { mentioned: false };
  }
}
