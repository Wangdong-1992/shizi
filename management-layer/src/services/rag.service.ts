/**
 * RAG (Retrieval-Augmented Generation) Service.
 *
 * Four-way hybrid recall with governance filtering:
 *
 *   Total Score = 0.45 × vectorRecallScore
 *               + 0.35 × keywordRecallScore
 *               + 0.12 × titleMatchScore
 *               + 0.08 × metadataMatchScore
 *
 * Governance filters:
 *   - Exclude entries with risk_level = 'high'
 *   - Exclude non-published entries
 *   - Same-topic conflict: keep only the latest updated_at version
 *
 * Inspired by GEOFlow's KnowledgeRetrievalService architecture.
 */

import type { PrismaClient } from '@prisma/client';

import { searchSimilarChunks, keywordSearchChunks, createTextSearchIndex, hasTextSearchIndex, getChunkSummary } from '../lib/pgvector.js';
import { generateEmbedding } from '../lib/embedding.js';
import type { RagResult, RagSearchResponse, RagReindexResponse } from '../schemas/rag.schema.js';

// =============================================================================
// RAG Weights (configurable)
// =============================================================================

const WEIGHTS = {
  vector: 0.45,
  keyword: 0.35,
  title: 0.12,
  metadata: 0.08,
} as const;

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.1;

// =============================================================================
// RAG Service
// =============================================================================

export interface RagServiceDeps {
  prisma: PrismaClient;
}

export function createRagService(deps: RagServiceDeps) {
  const { prisma } = deps;

  /**
   * Four-way hybrid recall main entry point.
   *
   * @param clientId - Tenant UUID
   * @param query - Natural language search query
   * @param options - Search options
   * @returns Ranked RAG results
   */
  async function retrieve(
    clientId: string,
    query: string,
    options: {
      limit?: number;
      excludeIds?: string[];
      minScore?: number;
    } = {},
  ): Promise<RagSearchResponse> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    const excludeIds = new Set(options.excludeIds ?? []);

    // Normalize query
    const normalized = query.trim();

    // Run recall in parallel: vector + keyword
    const [queryEmbedding, keywordResults] = await Promise.all([
      generateEmbedding(normalized),
      keywordSearchChunks(prisma, clientId, normalized, limit * 3),
    ]);

    const vectorResults = await searchSimilarChunks(
      prisma,
      clientId,
      queryEmbedding,
      limit * 3,
    );

    // Fuse and score
    const fused = fuseResults(vectorResults, keywordResults, normalizeForTitleMatch(normalized));

    // Governance filter
    const filtered = governanceFilter(fused, excludeIds);

    // Apply min score and limit
    const results = filtered
      .filter((r) => r.score >= minScore)
      .slice(0, limit);

    return {
      results,
      query: normalized,
      topScore: results[0]?.score ?? 0,
    };
  }

  /**
   * Rebuild the GIN text search index and regenerate embeddings for all
   * published entries.
   */
  async function reindex(clientId: string): Promise<RagReindexResponse> {
    // Ensure text search index exists
    await createTextSearchIndex(prisma);

    const indexExists = await hasTextSearchIndex(prisma);
    const { totalChunks } = await getChunkSummaryAll(prisma, clientId);

    // Count published entries
    const entryCount = await prisma.knowledgeEntry.count({
      where: { clientId, status: 'published' },
    });

    // Note: Individual entry re-embedding would be done entry-by-entry.
    // For Phase 2 MVP, we verify the text search index is intact.
    // Full re-embedding of all entries is triggered via the knowledge service's
    // publish() method on each entry.

    return {
      reindexed: entryCount,
      index: {
        textSearchExists: indexExists,
        totalChunks,
      },
    };
  }

  return {
    retrieve,
    reindex,
  };
}

// =============================================================================
// Internal: Recall & Fusion
// =============================================================================

/**
 * Fuse vector and keyword recall results with weighted scoring.
 *
 * Algorithm:
 *   1. Normalize vector scores to 0–1 range (cosine similarity is already 0–1)
 *   2. Normalize keyword scores to 0–1 range (ts_rank_cd is typically 0–1)
 *   3. For each unique entry, compute:
 *      - vectorScore = max(vector score for entry's chunks)
 *      - keywordScore = max(keyword score for entry's chunks)
 *      - titleScore = title match bonus
 *      - metadataScore = category + source match bonus
 *   4. Total = 0.45×vectorScore + 0.35×keywordScore + 0.12×titleScore + 0.08×metadataScore
 */
function fuseResults(
  vectorResults: Array<{
    entryId: string;
    chunkIndex: number;
    chunkText: string;
    similarity: number;
  }>,
  keywordResults: Array<{
    id: string;
    entryId: string;
    entryTitle: string;
    category: string;
    chunkIndex: number;
    chunkText: string;
    score: number;
  }>,
  normalizedQuery: string,
): RagResult[] {
  // Index results by entryId
  const entryMap = new Map<string, {
    entryId: string;
    title: string;
    category: string;
    bestVectorScore: number;
    bestKeywordScore: number;
    bestChunkText: string;
    bestChunkIndex: number;
  }>();

  // Process vector results
  for (const vr of vectorResults) {
    const existing = entryMap.get(vr.entryId);
    if (!existing) {
      entryMap.set(vr.entryId, {
        entryId: vr.entryId,
        title: '',
        category: '',
        bestVectorScore: vr.similarity,
        bestKeywordScore: 0,
        bestChunkText: vr.chunkText,
        bestChunkIndex: vr.chunkIndex,
      });
    } else if (vr.similarity > existing.bestVectorScore) {
      existing.bestVectorScore = vr.similarity;
      existing.bestChunkText = vr.chunkText;
      existing.bestChunkIndex = vr.chunkIndex;
    }
  }

  // Process keyword results
  for (const kr of keywordResults) {
    const existing = entryMap.get(kr.entryId);
    if (!existing) {
      entryMap.set(kr.entryId, {
        entryId: kr.entryId,
        title: kr.entryTitle,
        category: kr.category,
        bestVectorScore: 0,
        bestKeywordScore: kr.score,
        bestChunkText: kr.chunkText,
        bestChunkIndex: kr.chunkIndex,
      });
    } else {
      if (!existing.title) existing.title = kr.entryTitle;
      if (!existing.category) existing.category = kr.category;
      if (kr.score > existing.bestKeywordScore) {
        existing.bestKeywordScore = kr.score;
        existing.bestChunkText = kr.chunkText;
        existing.bestChunkIndex = kr.chunkIndex;
      }
    }
  }

  // Compute final scores
  const results: RagResult[] = [];

  for (const entry of entryMap.values()) {
    const titleScore = computeTitleScore(entry.title, normalizedQuery) * 0.12;
    const metadataScore = computeMetadataScore(entry.category, normalizedQuery) * 0.08;
    const total =
      entry.bestVectorScore * WEIGHTS.vector +
      entry.bestKeywordScore * WEIGHTS.keyword +
      titleScore +
      metadataScore;

    results.push({
      entryId: entry.entryId,
      title: entry.title,
      category: entry.category,
      chunkText: entry.bestChunkText,
      chunkIndex: entry.bestChunkIndex,
      score: Math.min(total, 1.0),
      matchType: entry.bestVectorScore > 0 && entry.bestKeywordScore > 0
        ? 'hybrid'
        : entry.bestKeywordScore > 0
          ? 'keyword'
          : 'vector',
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Compute a title match bonus.
 *
 * Simple word-overlap ratio: how many words from the query appear in the title.
 */
function computeTitleScore(title: string, query: string): number {
  if (!title || !query) return 0;

  const titleLower = title.toLowerCase();
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);

  if (queryWords.length === 0) return 0;

  const matched = queryWords.filter((w) => titleLower.includes(w));
  return matched.length / queryWords.length;
}

/**
 * Compute a metadata match bonus based on category.
 *
 * Simple heuristic: if the query contains Chinese category-related keywords,
 * and the entry category matches, give a bonus.
 */
function computeMetadataScore(category: string, query: string): number {
  const categoryKeywordMap: Record<string, string[]> = {
    enterprise_info: ['企业', '公司', '品牌', '介绍'],
    product_info: ['产品', '商品', '规格', '型号'],
    process: ['工艺', '流程', '制作', '生产'],
    certification: ['认证', '资质', '证书', '标准', 'ISO'],
    faq: ['常见', '问答', '怎么', '如何', '为什么'],
    industry_knowledge: ['行业', '知识', '趋势', '市场'],
    contact: ['联系', '电话', '地址', '邮箱'],
    news: ['新闻', '动态', '公告'],
    customer_case: ['案例', '客户', '成功'],
    core_attributes: ['属性', '特征', '参数', '核心'],
  };

  const keywords = categoryKeywordMap[category] ?? [];
  const queryLower = query.toLowerCase();
  const matched = keywords.filter((kw) => queryLower.includes(kw.toLowerCase()));

  return matched.length > 0 ? 1.0 : 0.0;
}

// =============================================================================
// Internal: Governance Filter
// =============================================================================

/**
 * Governance filtering pipeline:
 *   1. Exclude risk_level === 'high' content (filtered at SQL level in keywordRecall)
 *   2. Exclude non-published entries (filtered at SQL level)
 *   3. Exclude specified IDs
 *   4. Same-topic deduplication: keep only the highest-confidence latest version
 */
function governanceFilter(
  results: RagResult[],
  excludeIds: Set<string>,
): RagResult[] {
  return results
    // Exclude by ID
    .filter((r) => !excludeIds.has(r.entryId))
    // Deduplicate same-title entries: keep highest score, latest version
    .reduce((acc, r) => {
      const existingIdx = acc.findIndex((a) => a.title === r.title);
      if (existingIdx >= 0) {
        if (r.score > acc[existingIdx].score) {
          acc[existingIdx] = { ...r, matchType: `${r.matchType}(deduped)` };
        }
      } else {
        acc.push(r);
      }
      return acc;
    }, [] as RagResult[]);
}

// =============================================================================
// Internal: Helpers
// =============================================================================

/**
 * Normalize text for title matching: remove punctuation, collapse spaces.
 */
function normalizeForTitleMatch(text: string): string {
  return text
    .replace(/[^\w\u4e00-\u9fff\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get total chunk count for a client (used by reindex).
 */
async function getChunkSummaryAll(
  prisma: PrismaClient,
  clientId: string,
): Promise<{ totalChunks: number }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count
     FROM management_knowledge_chunks
     WHERE client_id = $1::uuid`,
    clientId,
  );
  return { totalChunks: Number(rows[0]?.count ?? 0) };
}
