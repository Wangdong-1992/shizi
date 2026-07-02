/**
 * Brand Entity Profile Service.
 *
 * Aggregates Phase 2-3 data into a four-dimension brand entity profile:
 *   Content | Visibility | Authority | Associations
 *
 * Zero new tables — pure aggregation of existing data.
 */

import type { PrismaClient } from '@prisma/client';
import { KNOWLEDGE_CATEGORIES, CATEGORY_LABELS } from '../schemas/knowledge.schema.js';

export interface BrandProfile {
  content: { totalEntries: number; categoriesCovered: number; avgConfidence: number };
  visibility: { mentionRate: number; platformBreakdown: Record<string, number>; weeklyTrend: Array<{ week: string; mentions: number }> };
  authority: { activePaths: number; schemaHealth: number; consistencyScore: number };
  associations: Array<{ word: string; count: number }>;
}

export interface OrgSchema {
  '@context': string; '@type': string;
  name: string; description: string;
  url: string | null;
  brand: { name: string };
  foundingDate: string | null;
  knowsAbout: Array<{ '@type': string; name: string }>;
}

export function createEntityProfileService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  async function getBrandProfile(clientId: string): Promise<BrandProfile> {
    const [entries, mentions, paths, consistency, catCount] = await Promise.all([
      prisma.knowledgeEntry.findMany({ where: { clientId }, select: { category: true, confidence: true } }),
      prisma.entityMention.findMany({ where: { clientId }, select: { mentioned: true, platform: true, checkedAt: true } }),
      prisma.directPath.count({ where: { clientId, status: 'active' } }),
      prisma.sourceConsistency.count({ where: { clientId, conflict: 'critical' } }),
      prisma.knowledgeEntry.groupBy({ by: ['category'], where: { clientId, status: 'published' } }),
    ]);

    const avgConf = entries.length > 0 ? entries.reduce((s, e) => s + (e.confidence ?? 0.5), 0) / entries.length : 0;
    const mTotal = mentions.length || 1;
    const mCount = mentions.filter((m) => m.mentioned).length;

    const platformBreakdown: Record<string, number> = {};
    for (const m of mentions) { platformBreakdown[m.platform] = (platformBreakdown[m.platform] ?? 0) + 1; }

    // Weekly trend (last 4 weeks)
    const weeklyTrend: Array<{ week: string; mentions: number }> = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date(Date.now() - (w + 1) * 7 * 86400000);
      const end = new Date(Date.now() - w * 7 * 86400000);
      const count = mentions.filter((m) => m.checkedAt >= start && m.checkedAt < end).length;
      weeklyTrend.push({ week: `W${w + 1}`, mentions: count });
    }

    // Associations: top 20 frequent words from knowledge entries
    const wordFreq: Record<string, number> = {};
    for (const e of entries) {
      if (!e.category) continue;
      const words = (CATEGORY_LABELS[e.category] ?? '').split('').concat(e.category.split('_'));
      for (const w of words) { if (w.length > 1) wordFreq[w] = (wordFreq[w] ?? 0) + 1; }
    }
    const associations = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));

    return {
      content: { totalEntries: entries.length, categoriesCovered: catCount.length, avgConfidence: Math.round(avgConf * 100) / 100 },
      visibility: { mentionRate: mCount / mTotal, platformBreakdown, weeklyTrend },
      authority: { activePaths: paths, schemaHealth: 70, consistencyScore: Math.max(0, 100 - consistency * 10) },
      associations,
    };
  }

  async function generateOrgSchema(clientId: string): Promise<OrgSchema> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const entries = await prisma.knowledgeEntry.findMany({
      where: { clientId, status: 'published' }, select: { title: true, category: true }, take: 10,
    });

    const foundingEntry = entries.find((e) => e.title.includes('成立') || e.title.includes('概况'));
    const foundingDate = foundingEntry ? extractYear(foundingEntry.title) : null;

    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: client?.brandName ?? client?.name ?? '',
      description: entries[0]?.title ?? '',
      url: client?.websiteUrl ?? null,
      brand: { name: client?.brandName ?? client?.name ?? '' },
      foundingDate,
      knowsAbout: entries.map((e) => ({ '@type': 'Thing', name: e.title })),
    };
  }

  async function checkSchemaHealth(clientId: string): Promise<{ valid: boolean; score: number; issues: string[] }> {
    const schema = await generateOrgSchema(clientId);
    const issues: string[] = [];
    if (!schema.name) issues.push('缺少 name 字段');
    if (!schema.url) issues.push('缺少 url（建议配置网站地址）');
    if (!schema.foundingDate) issues.push('缺少 foundingDate（建议在知识库中填写成立日期）');
    if (!schema.knowsAbout.length) issues.push('缺少 knowsAbout（建议发布更多知识条目）');
    return { valid: issues.length === 0, score: Math.max(0, 100 - issues.length * 25), issues };
  }

  return { getBrandProfile, generateOrgSchema, checkSchemaHealth };
}

function extractYear(text: string): string | null {
  const m = /(\d{4})年/.exec(text);
  return m ? m[1] : null;
}
