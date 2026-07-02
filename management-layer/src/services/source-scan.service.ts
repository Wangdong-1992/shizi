/**
 * Source Scan Service.
 *
 * Scans external sources (百度百科/1688/企查查/行业黄页/政府注册)
 * and compares extracted fields against our knowledge base baseline.
 *
 * Phase 4 Stage 1: auto-scan baidu_baike + alibaba_1688 (cheerio),
 * manual-only for qichacha/industry_yellowpage/gov_registry.
 */

import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/error.js';

const STANDARD_FIELDS = [
  '成立年份', '公司地址', '主营产品', '注册资本', '法人代表',
  '统一社会信用代码', '经营范围', '企业类型', '注册号', '联系电话',
];

const SOURCE_LABELS: Record<string, string> = {
  baidu_baike: '百度百科', qichacha: '企查查', alibaba_1688: '阿里巴巴1688',
  industry_yellowpage: '行业黄页', gov_registry: '政府注册信息',
};

const MANUAL_ONLY_SOURCES = ['qichacha', 'industry_yellowpage', 'gov_registry'];

export interface ScanResult { source: string; status: string; fields: number; conflicts: number; }

export function createSourceScanService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  async function scanSource(clientId: string, source: string): Promise<ScanResult> {
    if (MANUAL_ONLY_SOURCES.includes(source)) {
      await ensureProfile(clientId, source, 'manual_only');
      return { source, status: 'manual_only', fields: 0, conflicts: 0 };
    }

    // Ensure profile exists
    const profile = await ensureProfile(clientId, source, 'pending');

    // Fetch and parse
    let rawData: Record<string, string> | null = null;

    try {
      if (source === 'baidu_baike') {
        rawData = await fetchBaiduBaike(clientId);
      } else if (source === 'alibaba_1688') {
        rawData = await fetch1688(clientId);
      }
    } catch (err) {
      await prisma.sourceProfile.update({
        where: { id: profile.id },
        data: { status: 'failed', errorMsg: err instanceof Error ? err.message : 'Scan failed' },
      });
      return { source, status: 'failed', fields: 0, conflicts: 0 };
    }

    // Store raw data
    await prisma.sourceProfile.update({
      where: { id: profile.id },
      data: { rawData, status: 'success', lastScanned: new Date(), errorMsg: null },
    });

    // Compare with knowledge base
    const conflicts = await compareFields(clientId, profile.id, rawData ?? {});
    return { source, status: 'success', fields: Object.keys(rawData ?? {}).length, conflicts };
  }

  async function scanAll(clientId: string): Promise<ScanResult[]> {
    return Promise.all(Object.keys(SOURCE_LABELS).map((s) => scanSource(clientId, s)));
  }

  // -----------------------------------------------------------------------
  // Scrapers
  // -----------------------------------------------------------------------

  async function fetchBaiduBaike(clientId: string): Promise<Record<string, string>> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { brandName: true, name: true } });
    const name = client?.brandName ?? client?.name ?? '';

    if (!name) return {};

    // Phase 4 MVP: Simplified text extraction from search result page
    try {
      const url = `https://baike.baidu.com/search?word=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GEOPlatform/1.0 BaiduBaike Scanner (bot@geo-platform.com)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();

      // Simple regex extraction of infobox fields
      return {
        '成立年份': extractField(html, /成立时间[：:]\s*(\d{4}[年]?)/i),
        '公司地址': extractField(html, /总部地点[：:]\s*([^<]+)/i),
        '主营产品': extractField(html, /主要产品[：:]\s*([^<]+)/i),
        '注册资本': extractField(html, /注册资本[：:]\s*([^<]+)/i),
        '法人代表': extractField(html, /法定代表人[：:]\s*([^<]+)/i),
        '经营范围': extractField(html, /经营范围[：:]\s*([^<]+)/i),
      };
    } catch {
      return {};
    }
  }

  async function fetch1688(clientId: string): Promise<Record<string, string>> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { brandName: true, name: true } });
    const name = client?.brandName ?? client?.name ?? '';
    if (!name) return {};

    try {
      const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GEOPlatform/1.0 1688 Scanner' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      return {
        '主营产品': extractField(html, /主营[：:]\s*([^<]+)/i),
        '公司地址': extractField(html, /所在地[：:]\s*([^<]+)/i),
        '企业类型': extractField(html, /经营模式[：:]\s*([^<]+)/i),
        '注册资本': extractField(html, /注册资本[：:]\s*([^<]+)/i),
      };
    } catch {
      return {};
    }
  }

  // -----------------------------------------------------------------------
  // Comparison
  // -----------------------------------------------------------------------

  async function compareFields(clientId: string, profileId: string, theirData: Record<string, string>): Promise<number> {
    let conflicts = 0;

    // Get our baseline from knowledge entries
    const entries = await prisma.knowledgeEntry.findMany({
      where: { clientId, status: 'published', category: 'enterprise_info' },
      select: { content: true },
    });
    const ourContext = entries.map((e) => e.content).join('\n');

    for (const field of STANDARD_FIELDS) {
      const theirValue = theirData[field] ?? null;
      const ourValue = extractOurValue(ourContext, field);

      const normalized = theirValue && ourValue
        ? normalize(theirValue) === normalize(ourValue)
        : false;

      const conflict = !theirValue && !ourValue ? 'info'
        : !theirValue ? 'missing'
        : !ourValue ? 'info'
        : normalized ? 'consistent'
        : 'critical';

      if (conflict === 'critical') conflicts++;

      await prisma.sourceConsistency.create({
        data: { clientId, profileId, fieldName: field, ourValue, theirValue, normalized, conflict },
      });
    }

    return conflicts;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function normalize(s: string): string {
    return s
      .replace(/\s+/g, '')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/有限责任公司|有限公司|股份有限公司/g, '')
      .toLowerCase();
  }

  function extractOurValue(context: string, field: string): string | null {
    const patterns: Record<string, RegExp> = {
      '成立年份': /(\d{4})年?成立/,
      '公司地址': /公司[位坐]?落?于\s*([^，,\n。]{5,30})/,
      '主营产品': /(?:主营|主要产品)[：:]\s*([^\n]{3,50})/,
      '注册资本': /注册[资本金][：:]\s*([^\n]{3,20})/,
      '法人代表': /法人[代表]?[：:]\s*([^\n]{2,10})/,
      '统一社会信用代码': /信用代码[：:]\s*([A-Z0-9]{18})/i,
      '经营范围': /经营[范围][：:]\s*([^\n]{5,100})/,
      '企业类型': /(?:企业类型|公司类型)[：:]\s*([^\n]{2,20})/,
    };
    const regex = patterns[field];
    if (!regex) return null;
    const m = regex.exec(context);
    return m ? m[1].trim() : null;
  }

  function extractField(html: string, regex: RegExp): string {
    const m = regex.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  async function ensureProfile(clientId: string, source: string, status: string) {
    const existing = await prisma.sourceProfile.findUnique({
      where: { clientId_source: { clientId, source } },
    });
    if (existing) return existing;
    return prisma.sourceProfile.create({
      data: { clientId, source, sourceUrl: null, status },
    });
  }

  return { scanSource, scanAll };
}
