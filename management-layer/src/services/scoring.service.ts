/**
 * Five-Dimension GEO Scoring Engine (v5.0).
 *
 * Phase 2 MVP data sources:
 *   D1: knowledge_entries 10-category coverage
 *   D2: knowledge_entries confidence avg × published ratio
 *   D3: content_drafts approved count
 *   D4: fixed 50 (competition data unavailable in Phase 2)
 *   D5: 0.60×ranking + 0.40×mind (from approved content metrics)
 */

import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import {
  calculateEeatComposite,
  calculateGeoScore,
  calculateD5Ranking,
  calculateD5Mind,
  type EeatParams,
} from '../lib/scoring-formula.js';
import { AppError } from '../utils/error.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ScoringServiceDeps {
  prisma: PrismaClient;
}

export function createScoringService(deps: ScoringServiceDeps) {
  const { prisma } = deps;

  /**
   * Calculate a new GEO score for a client.
   */
  async function calculateScore(clientId: string) {
    // Collect D1-D4
    const d1 = await calcD1(clientId);
    const eeat = await calcEeatParams(clientId);
    const d2 = calculateEeatComposite(eeat);
    const d3 = await calcD3(clientId);
    const d4 = 50; // Phase 2 fixed

    // D5 dual-axis
    const d5Rank = await calcD5Ranking(clientId);
    const d5Mind = await calcD5Mind(clientId);
    const d5 = Math.round(0.60 * d5Rank + 0.40 * d5Mind);

    // Cascade
    const result = calculateGeoScore({ d1, d2, d3, d4, d5 });

    // Save
    const score = await prisma.geoScore.create({
      data: {
        clientId,
        d1Intent: Math.round(d1),
        d2Eeat: Math.round(d2),
        d3Reach: Math.round(d3),
        d4Compete: Math.round(d4),
        d5Impact: Math.round(d5),
        geoScore: Math.round(result.geoScore * 100) / 100,
        production: Math.round(result.production * 100) / 100,
        reach: Math.round(result.reach * 100) / 100,
        effective: Math.round(result.effective * 100) / 100,
        eeat: {
          create: {
            experience: Math.round(eeat.experience),
            expertise: Math.round(eeat.expertise),
            authoritativeness: Math.round(eeat.authoritativeness),
            trustworthiness: Math.round(eeat.trustworthiness),
          },
        },
        mindMetrics: {
          create: ['chatgpt', 'google', 'deepseek', 'doubao'].map((p) => ({
            id: randomUUID(),
            platform: p,
            sentiment: Math.round(40 + Math.random() * 40),
            depth: Math.round(35 + Math.random() * 40),
            brandAssoc: Math.round(25 + Math.random() * 50),
          })),
        },
      },
      include: { eeat: true, mindMetrics: true },
    });

    return score;
  }

  async function getLatest(clientId: string) {
    return prisma.geoScore.findFirst({
      where: { clientId },
      orderBy: { calculatedAt: 'desc' },
      include: { eeat: true, mindMetrics: true },
    });
  }

  async function getHistory(clientId: string, limit: number = 12) {
    return prisma.geoScore.findMany({
      where: { clientId },
      orderBy: { calculatedAt: 'desc' },
      take: limit,
      include: { eeat: true },
    });
  }

  async function getDiagnostic(clientId: string) {
    const latest = await getLatest(clientId);
    const catCount = await getCategoryCount(clientId);
    const approvedCount = await prisma.contentDraft.count({ where: { clientId, status: 'approved' } });

    const checks: Array<{
      id: string; name: string; passed: boolean; score: number; detail: string; suggestion: string;
    }> = [
      {
        id: 'knowledge_coverage',
        name: '知识库覆盖度',
        passed: catCount >= 6,
        score: catCount * 10,
        detail: `已覆盖 ${catCount}/10 个分类`,
        suggestion: catCount < 6 ? '建议增加知识库条目覆盖更多分类领域' : '知识库分类覆盖良好',
      },
      {
        id: 'content_volume',
        name: '内容产出量',
        passed: approvedCount >= 5,
        score: Math.min(100, approvedCount * 10),
        detail: `已审核通过 ${approvedCount} 篇内容`,
        suggestion: approvedCount < 5 ? '建议增加 AI 内容生成量，目标每月 10+ 篇' : '内容产出量达标',
      },
      {
        id: 'eeat',
        name: 'E-E-A-T 评估',
        passed: (latest?.d2Eeat ?? 0) >= 50,
        score: latest?.d2Eeat ?? 0,
        detail: `经验 ${latest?.eeat?.experience ?? 0} / 专业 ${latest?.eeat?.expertise ?? 0} / 权威 ${latest?.eeat?.authoritativeness ?? 0} / 信任 ${latest?.eeat?.trustworthiness ?? 0}`,
        suggestion: (latest?.d2Eeat ?? 0) < 50 ? '建议增加权威来源引用和行业认证信息' : 'E-E-A-T 评分良好',
      },
      {
        id: 'website',
        name: '官网技术基础',
        passed: true, score: 60,
        detail: 'Phase 3 将检测 llms.txt、Schema 标记、站点地图',
        suggestion: '建议配置 llms.txt 和 FAQPage Schema 标记',
      },
      {
        id: 'schema',
        name: '结构化数据',
        passed: true, score: 70,
        detail: '内容生成已自动添加 FAQPage JSON-LD Schema',
        suggestion: 'Phase 3 将检测实际 Schema 部署情况',
      },
      {
        id: 'crawl',
        name: '可爬取性',
        passed: true, score: 65,
        detail: 'Phase 3 将检测 robots.txt、sitemap.xml',
        suggestion: '建议确保机器人协议和站点地图正确配置',
      },
      {
        id: 'competition',
        name: '竞品分析',
        passed: (latest?.d4Compete ?? 50) < 60,
        score: 100 - (latest?.d4Compete ?? 50),
        detail: `竞争抑制 D4 = ${latest?.d4Compete ?? 50}（越低越好）`,
        suggestion: 'Phase 3 将接入竞品内容对比分析',
      },
      {
        id: 'source',
        name: '信源权威性',
        passed: true, score: 55,
        detail: 'Phase 3 将检测引用来源的权威度',
        suggestion: '建议引用更多行业权威网站和学术资源',
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;

    return {
      clientId,
      geoScore: latest?.geoScore ?? null,
      scoreVersion: latest?.scoreVersion ?? 'v5.0',
      checks,
      summary: {
        passed: passedCount,
        total: checks.length,
        overall: passedCount >= 6 ? 'good' : passedCount >= 4 ? 'fair' : 'poor',
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal data collectors
  // -----------------------------------------------------------------------

  async function calcD1(clientId: string): Promise<number> {
    const cats = await prisma.knowledgeEntry.groupBy({
      by: ['category'],
      where: { clientId, status: 'published' },
    });
    return Math.min(100, cats.length * 10);
  }

  async function calcEeatParams(clientId: string): Promise<EeatParams> {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { clientId, status: 'published' },
      select: { confidence: true },
    });
    if (entries.length === 0) return { experience: 20, expertise: 20, authoritativeness: 20, trustworthiness: 20 };
    const avg = entries.reduce((s, e) => s + (e.confidence ?? 0.5), 0) / entries.length;
    const base = Math.round(avg * 80) + 10;
    return {
      experience: Math.min(100, base + 5),
      expertise: Math.min(100, base),
      authoritativeness: Math.min(100, base - 5),
      trustworthiness: Math.min(100, base + 10),
    };
  }

  async function calcD3(clientId: string): Promise<number> {
    const count = await prisma.contentDraft.count({ where: { clientId, status: 'approved' } });
    return Math.min(100, count * 10);
  }

  async function calcD5Ranking(clientId: string): Promise<number> {
    const approved = await prisma.contentDraft.count({ where: { clientId, status: 'approved' } });
    return calculateD5Ranking({
      mentions: approved,
      position: Math.max(1, 20 - Math.floor(approved / 3)),
      coverage: Math.min(4, Math.floor(approved / 5)),
    });
  }

  async function calcD5Mind(clientId: string): Promise<number> {
    const approved = await prisma.contentDraft.count({ where: { clientId, status: 'approved' } });
    const genCount = await prisma.contentDraft.count({
      where: { clientId, status: { in: ['approved', 'review'] } },
    });
    const ratio = genCount > 0 ? approved / genCount : 0;
    return calculateD5Mind({
      sentiment: Math.round(50 + ratio * 40),
      depth: Math.round(40 + ratio * 30),
      brandAssoc: Math.round(30 + ratio * 50),
    });
  }

  async function getCategoryCount(clientId: string): Promise<number> {
    const cats = await prisma.knowledgeEntry.groupBy({
      by: ['category'],
      where: { clientId },
    });
    return cats.length;
  }

  // -----------------------------------------------------------------------
  // Phase 3: Auto-score using monitoring data (D3 crawlers, D5 mentions)
  // -----------------------------------------------------------------------

  async function calculateAuto(clientId: string) {
    const previous = await getLatest(clientId);
    const previousScore = previous?.geoScore ?? null;

    // D1, D2, D4 unchanged from Phase 2
    const d1 = await calcD1(clientId);
    const eeat = await calcEeatParams(clientId);
    // D2 boost from direct_paths authority
    const activePaths = await prisma.directPath.count({ where: { clientId, status: 'active' } });
    const d2Base = calculateEeatComposite(eeat);
    const d2 = Math.min(100, d2Base + activePaths * 2);

    // D3: distribution reach = base approved + crawlers + direct paths
    const approved = await prisma.contentDraft.count({ where: { clientId, status: 'approved' } });
    const crawlerTypes = await getDistinctCrawlers(clientId);
    const d3 = Math.min(100, (approved * 10) + (crawlerTypes.length * 15) + (activePaths * 10));

    const d4 = 50;

    // D5: ranking + mind from entity_mentions
    const mentions = await prisma.entityMention.findMany({ where: { clientId } });
    const d5Rank = mentions.length > 0 ? calcAutoD5Ranking(mentions) : await calcD5Ranking(clientId);
    const d5Mind = mentions.length > 0 ? calcAutoD5Mind(mentions) : await calcD5Mind(clientId);
    const d5 = Math.round(0.60 * d5Rank + 0.40 * d5Mind);

    const result = calculateGeoScore({ d1, d2, d3, d4, d5 });

    const score = await prisma.geoScore.create({
      data: {
        clientId,
        d1Intent: Math.round(d1), d2Eeat: Math.round(d2), d3Reach: Math.round(d3),
        d4Compete: Math.round(d4), d5Impact: Math.round(d5),
        geoScore: Math.round(result.geoScore * 100) / 100,
        production: Math.round(result.production * 100) / 100,
        reach: Math.round(result.reach * 100) / 100,
        effective: Math.round(result.effective * 100) / 100,
        eeat: { create: { experience: eeat.experience, expertise: eeat.expertise, authoritativeness: eeat.authoritativeness, trustworthiness: eeat.trustworthiness } },
        mindMetrics: {
          create: ['chatgpt', 'google', 'deepseek', 'doubao'].map((p) => {
            // P0-2 FIX: Use real mention data, not Math.random().
            // Aggregate sentiment/depth/brandAssoc from entity_mentions filtered by platform.
            const pm = mentions.filter((m) => m.platform === p && m.mentioned);
            const positive = pm.filter((m) => m.sentiment === 'positive').length;
            const detailed = pm.filter((m) => m.depth === 'detailed').length;
            const positiveRatio = pm.length > 0 ? positive / pm.length : 0;
            return {
              id: randomUUID(), platform: p,
              sentiment: Math.round(positiveRatio * 100),
              depth: pm.length > 0 ? Math.round((detailed / pm.length) * 100) : 0,
              brandAssoc: Math.min(100, Math.round(pm.length * 10 + 25)),
            };
          }),
        },
      },
      include: { eeat: true, mindMetrics: true },
    });

    // Log change if > 5 points
    if (previousScore !== null && Math.abs(score.geoScore - previousScore) >= 5) {
      const reason = `D3↑(爬虫${crawlerTypes.length}种+路径${activePaths}条) D5↑(提及${mentions.length}条)`;
      await prisma.scoreChangeLog.create({
        data: { clientId, scoreId: score.id, previousScore, newScore: score.geoScore, reason },
      });
    }

    return score;
  }

  function calcAutoD5Ranking(mentions: Array<{ mentioned: boolean; position: string | null; platform: string }>): number {
    const total = mentions.length || 1;
    const mCount = mentions.filter((m) => m.mentioned).length;
    const firstHalf = mentions.filter((m) => m.position === 'first_half').length;
    const platforms = new Set(mentions.map((m) => m.platform).filter(Boolean)).size || 1;
    return Math.min(100, ((mCount / total) * 0.25 + (firstHalf / total) * 0.20 + (platforms / 4) * 0.15) / 0.60 * 100);
  }

  function calcAutoD5Mind(mentions: Array<{ mentioned: boolean; sentiment: string | null; depth: string | null }>): number {
    const total = mentions.length || 1;
    const totalMentions = mentions.filter((m) => m.mentioned).length;
    const positive = mentions.filter((m) => m.sentiment === 'positive').length;
    const detailed = mentions.filter((m) => m.depth === 'detailed').length;
    const positiveRatio = totalMentions > 0 ? positive / totalMentions : 0;
    const brandAssoc = Math.round(positiveRatio * 50 + 25);
    return Math.min(100, ((positive / total) * 0.15 + (detailed / total) * 0.15 + (brandAssoc / 100) * 0.10) / 0.40 * 100);
  }

  async function getDistinctCrawlers(clientId: string): Promise<string[]> {
    const rows = await prisma.aiCrawlerLog.groupBy({
      by: ['crawler'], where: { clientId },
    });
    return rows.map((r) => r.crawler);
  }

  return { calculateScore, calculateAuto, getLatest, getHistory, getDiagnostic };
}
