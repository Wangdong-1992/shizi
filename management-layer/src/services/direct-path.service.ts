/**
 * Direct Path Service.
 *
 * Manages 6 SEO/information discovery paths:
 *   llms.txt | 百度百科 | 百度智能体 | 搜狗百科 | Wikidata | 企查查
 *
 * All paths are status-tracked only (non-automated operations).
 * BullMQ scheduler runs daily HTTP checks at 6:00 AM.
 */

import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/error.js';

// ---------------------------------------------------------------------------
// Path Definitions
// ---------------------------------------------------------------------------

export const PATH_DEFINITIONS = [
  { type: 'llms_txt',      label: 'llms.txt 部署',       icon: 'FileText' },
  { type: 'baidu_baike',   label: '百度百科词条',        icon: 'BookOpen' },
  { type: 'baidu_agent',   label: '百度智能体',          icon: 'Bot' },
  { type: 'sogou_baike',   label: '搜狗百科词条',        icon: 'BookMarked' },
  { type: 'wikidata',      label: 'Wikidata 条目',       icon: 'Globe' },
  { type: 'qichacha',      label: '企查查企业信息',      icon: 'Building' },
] as const;

export type PathType = typeof PATH_DEFINITIONS[number]['type'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface DirectPathServiceDeps {
  prisma: PrismaClient;
}

export function createDirectPathService(deps: DirectPathServiceDeps) {
  const { prisma } = deps;

  async function getPaths(clientId: string) {
    return prisma.directPath.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function updatePath(
    id: string, clientId: string,
    data: { url?: string; status?: string; errorMessage?: string; metadata?: Record<string, unknown> },
  ) {
    const path = await prisma.directPath.findFirst({ where: { id, clientId } });
    if (!path) throw new AppError(404, '路径不存在');

    return prisma.directPath.update({
      where: { id },
      data: {
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  }

  async function checkPath(clientId: string, pathType: string) {
    const path = await prisma.directPath.findFirst({
      where: { clientId, pathType },
    });
    if (!path) throw new AppError(404, '路径不存在');

    let status = 'pending';
    let errorMessage: string | null = null;
    const metadata: Record<string, unknown> = {};

    try {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { brandName: true, name: true, websiteUrl: true },
      });

      const brandName = client?.brandName ?? client?.name ?? '';

      switch (pathType) {
        case 'llms_txt': {
          const baseUrl = client?.websiteUrl ?? path.url ?? '';
          if (!baseUrl) {
            status = 'not_applicable';
            errorMessage = '未配置网站 URL';
            break;
          }
          const llmsUrl = `${baseUrl.replace(/\/$/, '')}/llms.txt`;
          try {
            const res = await fetch(llmsUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
            status = res.ok ? 'active' : 'pending';
            metadata.httpStatus = res.status;
          } catch {
            status = 'error';
            errorMessage = 'HTTP 请求失败';
          }
          break;
        }

        case 'baidu_baike': {
          if (!brandName) { status = 'not_applicable'; errorMessage = '未配置品牌名称'; break; }
          try {
            const url = `https://baike.baidu.com/search?word=${encodeURIComponent(brandName)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            status = res.ok ? 'active' : 'pending';
            metadata.httpStatus = res.status;
          } catch {
            status = 'error';
            errorMessage = '检测请求失败';
          }
          break;
        }

        case 'sogou_baike': {
          if (!brandName) { status = 'not_applicable'; errorMessage = '未配置品牌名称'; break; }
          try {
            const url = `https://baike.sogou.com/v6430849.htm?fromTitle=${encodeURIComponent(brandName)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            status = res.ok ? 'active' : 'pending';
            metadata.httpStatus = res.status;
          } catch {
            status = 'error';
            errorMessage = '检测请求失败';
          }
          break;
        }

        case 'wikidata': {
          if (!brandName) { status = 'not_applicable'; errorMessage = '未配置品牌名称'; break; }
          try {
            const apiUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=zh&format=json`;
            const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
            if (res.ok) {
              const body = await res.json() as { search?: Array<unknown> };
              status = (body.search?.length ?? 0) > 0 ? 'active' : 'pending';
              metadata.resultCount = body.search?.length ?? 0;
            } else {
              status = 'error';
              metadata.httpStatus = res.status;
            }
          } catch {
            status = 'error';
            errorMessage = 'API 请求失败';
          }
          break;
        }

        case 'baidu_agent':
          status = 'pending';
          metadata.note = 'Phase 3 不做实时检测';
          break;

        case 'qichacha':
          status = 'pending';
          metadata.note = 'Phase 3 不做实时检测';
          break;
      }
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : '检测异常';
    }

    return prisma.directPath.update({
      where: { id: path.id },
      data: { status, errorMessage: errorMessage ?? null, metadata, lastChecked: new Date() },
    });
  }

  async function checkAll(clientId: string) {
    const paths = await prisma.directPath.findMany({ where: { clientId } });
    const results = [];
    for (const p of paths) {
      try {
        const result = await checkPath(clientId, p.pathType);
        results.push({ type: p.pathType, status: result.status });
      } catch (err) {
        results.push({ type: p.pathType, status: 'error', error: String(err) });
      }
    }
    return results;
  }

  return { getPaths, updatePath, checkPath, checkAll };
}
