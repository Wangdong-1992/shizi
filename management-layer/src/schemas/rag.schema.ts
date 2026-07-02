/**
 * RAG (Retrieval-Augmented Generation) Zod Schemas.
 *
 * Validates request bodies and query parameters for RAG search endpoints.
 */

import { z } from 'zod';

/**
 * RAG search request body.
 *
 * @example
 *   { "query": "水果罐头怎么选？", "limit": 5, "clientId": "..." }
 */
export const ragSearchSchema = z.object({
  /** Natural language search query */
  query: z.string().min(1, '查询不能为空').max(2000, '查询不能超过 2000 字符'),

  /** Maximum number of results to return (default: 5) */
  limit: z.coerce.number().int().min(1).max(20).default(5),

  /** Tenant UUID — extracted from JWT client_id at runtime */
  clientId: z.string().uuid('clientId 必须是有效 UUID'),
});

/**
 * Reindex request body.
 */
export const ragReindexSchema = z.object({
  /** Tenant UUID */
  clientId: z.string().uuid('clientId 必须是有效 UUID'),
});

/**
 * Types inferred from schemas.
 */
export type RagSearchInput = z.infer<typeof ragSearchSchema>;
export type RagReindexInput = z.infer<typeof ragReindexSchema>;

// ---------------------------------------------------------------------------
// RAG Result Types
// ---------------------------------------------------------------------------

/** Individual RAG search result. */
export interface RagResult {
  /** Knowledge entry UUID */
  entryId: string;
  /** Entry title */
  title: string;
  /** Knowledge category */
  category: string;
  /** Matching chunk text */
  chunkText: string;
  /** Chunk index within the entry */
  chunkIndex: number;
  /** Combined relevance score (0–1) */
  score: number;
  /** Match type: vector | keyword | hybrid */
  matchType: 'vector' | 'keyword' | 'hybrid';
}

/** RAG search response. */
export interface RagSearchResponse {
  /** Ranked results */
  results: RagResult[];
  /** Original query (echo) */
  query: string;
  /** Top score */
  topScore: number;
}

/** RAG reindex response. */
export interface RagReindexResponse {
  /** Number of entries reindexed */
  reindexed: number;
  /** Index status summary */
  index: {
    textSearchExists: boolean;
    totalChunks: number;
  };
}
