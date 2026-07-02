/**
 * Knowledge Service.
 *
 * Handles CRUD operations for knowledge entries with publishing workflow:
 *   draft → publish (chunk + embed + vector store + GEOFlow sync) → published
 *   published → unpublish (delete chunks) → archived
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { AppError } from '../utils/error.js';
import { chunkContent } from '../lib/knowledge-chunker.js';
import { generateEmbeddings } from '../lib/embedding.js';
import { bulkInsertChunks, deleteChunksByEntryId, getChunkSummary } from '../lib/pgvector.js';
import { env } from '../config/env.js';
import {
  KNOWLEDGE_CATEGORIES,
  CATEGORY_LABELS,
  type KnowledgeCategory,
} from '../schemas/knowledge.schema.js';
import type {
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  KnowledgeQuery,
  KnowledgeResponse,
  CategoryStats,
} from '../schemas/knowledge.schema.js';

export interface KnowledgeServiceDeps {
  prisma: PrismaClient;
}

export function createKnowledgeService(deps: KnowledgeServiceDeps) {
  const { prisma } = deps;

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async function create(
    input: CreateKnowledgeInput,
    clientId: string,
  ): Promise<KnowledgeResponse> {
    const entry = await prisma.knowledgeEntry.create({
      data: {
        clientId,
        title: input.title,
        category: input.category,
        content: input.content,
        contentHtml: input.contentHtml ?? null,
        source: input.source ?? null,
        confidence: input.confidence ?? null,
        riskLevel: input.riskLevel ?? null,
        status: 'draft',
        version: 1,
      },
    });

    return toResponse(entry);
  }

  async function list(
    query: KnowledgeQuery,
    clientId: string,
  ): Promise<{ items: KnowledgeResponse[]; total: number }> {
    const where: Prisma.KnowledgeEntryWhereInput = { clientId };

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.knowledgeEntry.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.knowledgeEntry.count({ where }),
    ]);

    return {
      items: entries.map(toResponse),
      total,
    };
  }

  async function getById(id: string, clientId: string): Promise<KnowledgeResponse> {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, clientId },
    });

    if (!entry) {
      throw new AppError(404, '知识条目不存在');
    }

    return toResponse(entry);
  }

  async function update(
    id: string,
    clientId: string,
    input: UpdateKnowledgeInput,
  ): Promise<KnowledgeResponse> {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, clientId },
    });

    if (!entry) {
      throw new AppError(404, '知识条目不存在');
    }

    const data: Prisma.KnowledgeEntryUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.category !== undefined) data.category = input.category;
    if (input.content !== undefined) data.content = input.content;
    if (input.contentHtml !== undefined) data.contentHtml = input.contentHtml;
    if (input.source !== undefined) data.source = input.source;
    if (input.confidence !== undefined) data.confidence = input.confidence;
    if (input.riskLevel !== undefined) data.riskLevel = input.riskLevel;

    const updated = await prisma.knowledgeEntry.update({
      where: { id },
      data,
    });

    return toResponse(updated);
  }

  async function remove(id: string, clientId: string): Promise<void> {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, clientId },
    });

    if (!entry) {
      throw new AppError(404, '知识条目不存在');
    }

    // Delete chunks first (cascaded by Prisma, but explicit is safer)
    await deleteChunksByEntryId(prisma, id);

    await prisma.knowledgeEntry.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Publish workflow: chunk → embed → vector store → GEOFlow sync
  // -------------------------------------------------------------------------

  async function publish(id: string, clientId: string): Promise<KnowledgeResponse> {
    // P0-3 FIX: Wrap entire publish sequence in a transaction.
    // Chunk→embedding→bulkInsert→sync→statusUpdate must be atomic.
    return prisma.$transaction(async (tx) => {
      const entry = await tx.knowledgeEntry.findFirst({
        where: { id, clientId },
      });

      if (!entry) {
        throw new AppError(404, '知识条目不存在');
      }

      if (entry.status === 'published') {
        throw new AppError(400, '知识条目已发布');
      }

      // Step 1: Chunk the content
      const chunks = chunkContent(entry.content);

      if (chunks.length === 0) {
        throw new AppError(400, '内容为空，无法生成切片');
      }

      // Step 2: Generate embeddings for all chunks
      const texts = chunks.map((c) => c.chunkText);
      const embeddings = await generateEmbeddings(texts);

      // Step 3: Build chunk records and bulk insert
      const chunkRecords = chunks.map((c, i) => ({
        id: randomUUID(),
        entryId: entry.id,
        clientId: entry.clientId,
        chunkIndex: c.chunkIndex,
        chunkText: c.chunkText,
        tokenCount: c.tokenCount,
        embedding: embeddings[i],
        metadata: { source: 'knowledge-chunker', version: 1 },
      }));

      // Delete existing chunks before inserting new ones (re-publish scenario)
      await deleteChunksByEntryId(prisma, id);
      await bulkInsertChunks(prisma, chunkRecords);

      // Step 4: Sync to GEOFlow — failure now propagates (P0-3 fix)
      let geoflowKbId: string | null = null;

      geoflowKbId = await syncToGeoFlow(entry.id, entry.title, entry.category, entry.content, clientId);

      // Step 5: Update status
      const updated = await tx.knowledgeEntry.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          version: entry.version + 1,
          geoflowKbId,
        },
      });

      return mapToResponse(updated);
    });
  }

  async function unpublish(id: string, clientId: string): Promise<KnowledgeResponse> {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, clientId },
    });

    if (!entry) {
      throw new AppError(404, '知识条目不存在');
    }

    if (entry.status !== 'published') {
      throw new AppError(400, '只能取消已发布的知识条目');
    }

    // Delete chunks
    await deleteChunksByEntryId(prisma, id);

    const updated = await prisma.knowledgeEntry.update({
      where: { id },
      data: {
        status: 'archived',
        geoflowKbId: null,
        geoflowSyncedAt: null,
      },
    });

    return toResponse(updated);
  }

  // -------------------------------------------------------------------------
  // Category statistics
  // -------------------------------------------------------------------------

  async function getCategories(clientId: string): Promise<CategoryStats[]> {
    const stats: CategoryStats[] = [];

    for (const category of KNOWLEDGE_CATEGORIES) {
      const [total, draft, published] = await Promise.all([
        prisma.knowledgeEntry.count({ where: { clientId, category } }),
        prisma.knowledgeEntry.count({ where: { clientId, category, status: 'draft' } }),
        prisma.knowledgeEntry.count({ where: { clientId, category, status: 'published' } }),
      ]);

      stats.push({
        category,
        label: CATEGORY_LABELS[category as KnowledgeCategory],
        total,
        draft,
        published,
      });
    }

    return stats;
  }

  return {
    create,
    list,
    getById,
    update,
    remove,
    publish,
    unpublish,
    getCategories,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResponse(entry: any): KnowledgeResponse {
  return {
    id: entry.id,
    clientId: entry.clientId,
    category: entry.category,
    title: entry.title,
    content: entry.content,
    contentHtml: entry.contentHtml ?? null,
    source: entry.source ?? null,
    confidence: entry.confidence ?? null,
    riskLevel: entry.riskLevel ?? null,
    version: entry.version,
    status: entry.status,
    publishedAt: entry.publishedAt?.toISOString?.() ?? null,
    geoflowKbId: entry.geoflowKbId ?? null,
    geoflowSyncedAt: entry.geoflowSyncedAt?.toISOString?.() ?? null,
    createdAt: entry.createdAt?.toISOString?.() ?? '',
    updatedAt: entry.updatedAt?.toISOString?.() ?? '',
  };
}

/**
 * Sync a knowledge entry to GEOFlow via the management bridge API.
 * Uses Nginx reverse proxy: management → nginx → geoflow (FastCGI).
 */
async function syncToGeoFlow(
  managementKbId: string,
  name: string,
  category: string,
  content: string,
  clientId: string,
): Promise<string | null> {
  const geoflowUrl = env.GEOFLOW_API_URL;
  const syncUrl = `${geoflowUrl}/mgmt/knowledge/sync`;

  const jwtSecret = env.JWT_SECRET;
  // Use dynamic import to avoid circular dependency
  const jwt = await import('jsonwebtoken');

  const token = jwt.default.sign(
    {
      sub: 'system',
      role: 'ADMIN',
      client_id: clientId,
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: 'geo-management',
    },
  );

  const response = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      management_kb_id: managementKbId,
      name,
      category,
      content,
    }),
  });

  if (!response.ok) {
    throw new Error(`GEOFlow sync returned ${response.status}`);
  }

  const body = await response.json() as { geoflow_kb_id?: string; id?: string };

  return body.geoflow_kb_id ?? body.id ?? null;
}
