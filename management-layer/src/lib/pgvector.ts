/**
 * pgvector Query Utilities.
 *
 * Provides functions for vector similarity search, bulk insert, and cleanup
 * against the management_knowledge_chunks table. All queries use Prisma's
 * $queryRaw / $executeRaw since Prisma does not provide type-safe operations
 * for pgvector's `Unsupported("vector(1536)")` column.
 *
 * @warning 调用方必须使用 $1/$2 参数化占位符。不要直接拼接用户输入到 SQL 字符串中。
 */

import type { PrismaClient } from '@prisma/client';

/**
 * Search for chunks most similar to a given embedding vector.
 * Uses cosine similarity via the `<=>` operator (pgvector).
 *
 * @param prisma - PrismaClient instance
 * @param clientId - Tenant UUID for RLS filtering
 * @param embedding - 1536-dimensional vector from text-embedding-3-small
 * @param limit - Maximum number of results (default: 5)
 * @returns Chunks ordered by similarity (most similar first), with similarity score
 */
export async function searchSimilarChunks(
  prisma: PrismaClient,
  clientId: string,
  embedding: number[],
  limit: number = 5,
): Promise<Array<{
  id: string;
  entryId: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number | null;
  similarity: number;
}>> {
  // P0-4 FIX: Validate embedding values to prevent non-numeric SQL injection
  if (!embedding.every((v: number) => typeof v === 'number' && !isNaN(v) && isFinite(v))) {
    throw new Error('Invalid embedding vector: contains non-numeric or non-finite values');
  }
  // Format the embedding as a pgvector literal: '[0.1, 0.2, ...]'
  const vectorStr = `[${embedding.join(',')}]`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      entry_id: string;
      chunk_index: number;
      chunk_text: string;
      token_count: number | null;
      similarity: number;
    }>
  >(
    `SELECT
      id,
      entry_id,
      chunk_index,
      chunk_text,
      token_count,
      1 - (embedding <=> $1::vector) AS similarity
    FROM management_knowledge_chunks
    WHERE client_id = $2::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3`,
    vectorStr,
    clientId,
    limit,
  );

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    tokenCount: row.token_count,
    similarity: Number(row.similarity),
  }));
}

/**
 * Bulk insert knowledge chunks with embeddings.
 *
 * @param prisma - PrismaClient instance
 * @param chunks - Array of chunk objects to insert
 */
export async function bulkInsertChunks(
  prisma: PrismaClient,
  chunks: Array<{
    id: string;
    entryId: string;
    clientId: string;
    chunkIndex: number;
    chunkText: string;
    tokenCount: number | null;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  // Build a parameterized multi-value INSERT
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const chunk of chunks) {
    if (!chunk.embedding.every((v: number) => typeof v === 'number' && !isNaN(v) && isFinite(v))) {
      throw new Error(`Invalid embedding vector for chunk ${chunk.id}: contains non-numeric or non-finite values`);
    }
    const vectorStr = `[${chunk.embedding.join(',')}]`;
    placeholders.push(
      `($${paramIdx++}::uuid, $${paramIdx++}::uuid, $${paramIdx++}::uuid, `
      + `$${paramIdx++}::int, $${paramIdx++}::text, $${paramIdx++}::int, `
      + `$${paramIdx++}::vector, $${paramIdx++}::jsonb)`,
    );
    params.push(
      chunk.id,
      chunk.entryId,
      chunk.clientId,
      chunk.chunkIndex,
      chunk.chunkText,
      chunk.tokenCount ?? null,
      vectorStr,
      JSON.stringify(chunk.metadata ?? {}),
    );
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO management_knowledge_chunks
      (id, entry_id, client_id, chunk_index, chunk_text, token_count, embedding, metadata)
    VALUES ${placeholders.join(', ')}`,
    ...params,
  );
}

/**
 * Delete all chunks belonging to a knowledge entry.
 * Used when unpublishing or re-publishing (to regenerate chunks).
 *
 * @param prisma - PrismaClient instance
 * @param entryId - The knowledge entry UUID
 * @returns Number of deleted chunks
 */
export async function deleteChunksByEntryId(
  prisma: PrismaClient,
  entryId: string,
): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM management_knowledge_chunks WHERE entry_id = $1::uuid`,
    entryId,
  );
  return result;
}

/**
 * Get a summary of chunks for an entry (count + token stats).
 *
 * @param prisma - PrismaClient instance
 * @param entryId - The knowledge entry UUID
 */
export async function getChunkSummary(
  prisma: PrismaClient,
  entryId: string,
): Promise<{ totalChunks: number; totalTokens: number | null }> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ total_chunks: bigint; total_tokens: bigint | null }>
  >(
    `SELECT
      COUNT(*) AS total_chunks,
      SUM(token_count) AS total_tokens
    FROM management_knowledge_chunks
    WHERE entry_id = $1::uuid`,
    entryId,
  );

  return {
    totalChunks: Number(rows[0]?.total_chunks ?? 0),
    totalTokens: rows[0]?.total_tokens != null ? Number(rows[0].total_tokens) : null,
  };
}

// =============================================================================
// Full-Text Search (Keyword Recall for RAG)
// =============================================================================

/**
 * Keyword-based full-text search on knowledge chunks.
 * Uses PostgreSQL `ts_rank_cd` with `to_tsvector('simple', chunk_text)`
 * for ranking. The 'simple' configuration treats Chinese characters as
 * individual tokens, providing basic keyword matching.
 *
 * @param prisma - PrismaClient instance
 * @param clientId - Tenant UUID for filtering
 * @param query - Search query text
 * @param limit - Maximum number of results (default: 10)
 * @returns Chunks ordered by full-text rank (highest first)
 */
export async function keywordSearchChunks(
  prisma: PrismaClient,
  clientId: string,
  query: string,
  limit: number = 10,
): Promise<Array<{
  id: string;
  entryId: string;
  entryTitle: string;
  category: string;
  chunkIndex: number;
  chunkText: string;
  score: number;
}>> {
  // Normalize: strip special chars, collapse whitespace
  const normalized = query
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      entry_id: string;
      entry_title: string;
      category: string;
      chunk_index: number;
      chunk_text: string;
      score: number;
    }>
  >(
    `SELECT
      c.id,
      c.entry_id,
      e.title AS entry_title,
      e.category,
      c.chunk_index,
      c.chunk_text,
      ts_rank_cd(
        to_tsvector('simple', c.chunk_text),
        plainto_tsquery('simple', $1)
      ) AS score
    FROM management_knowledge_chunks c
    JOIN management_knowledge_entries e ON c.entry_id = e.id
    WHERE c.client_id = $2::uuid
      AND e.status = 'published'
      AND e.risk_level IS DISTINCT FROM 'high'
    ORDER BY score DESC
    LIMIT $3`,
    normalized,
    clientId,
    limit,
  );

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    entryTitle: row.entry_title,
    category: row.category,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    score: Number(row.score),
  }));
}

/**
 * Create the GIN full-text search index on knowledge chunks.
 * Run once via migration or on-demand via the reindex endpoint.
 *
 * @param prisma - PrismaClient instance
 */
export async function createTextSearchIndex(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_chunks_text_search
    ON management_knowledge_chunks
    USING gin(to_tsvector('simple', chunk_text))
  `);
}

/**
 * Check if the GIN text search index exists.
 *
 * @param prisma - PrismaClient instance
 */
export async function hasTextSearchIndex(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_chunks_text_search'
    ) AS exists`,
  );
  return rows[0]?.exists ?? false;
}
