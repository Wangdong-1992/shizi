/**
 * Content Generation Service.
 *
 * Orchestrates AI content generation with RAG context injection:
 *   1. Load ContentDraft (title)
 *   2. RAG retrieve → knowledge context
 *   3. Build generation prompt (Q&A format + FAQPage Schema + RAG context)
 *   4. AI generate with provider fallback
 *   5. Parse result → FAQ schema → update draft
 *   6. Estimate aiRatio
 */

import type { PrismaClient } from '@prisma/client';

import { createRagService } from './rag.service.js';
import { generateWithFallback } from '../lib/ai-providers/provider-factory.js';
import { generateFaqSchema, extractQAPairs } from '../lib/faq-schema.js';
import { AppError } from '../utils/error.js';

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const QA_GENERATION_PROMPT = `你是一位专业的内容创作者。请基于以下知识库证据，以问答（Q&A）格式生成一篇专业回答。

【问题】
{title}

【知识库证据】
{ragContext}

【要求】
1. 回答必须以 Q&A 格式呈现（问题+回答），可以包含多个相关的子问题
2. 在回答末尾包含 FAQPage JSON-LD Schema 标记
3. 引用知识库证据时标注来源（如"[来源：企业信息]"）
4. 不要编造知识库中没有的数据，如果某方面知识库没有覆盖，明确说明
5. 语言：专业但易读，面向普通消费者
6. 字数：800-1500 字
7. 使用中文回答`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ContentGenerationDeps {
  prisma: PrismaClient;
}

export function createContentGenerationService(deps: ContentGenerationDeps) {
  const { prisma } = deps;
  const ragService = createRagService({ prisma });

  /**
   * Generate content for a draft.
   *
   * Flow: RAG → prompt → AI → FAQ schema → update draft
   *
   * @param draftId - ContentDraft UUID
   * @param clientId - Tenant UUID
   */
  async function generateContent(draftId: string, clientId: string): Promise<void> {
    // Load draft
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, clientId },
    });

    if (!draft) {
      throw new AppError(404, '内容草稿不存在');
    }

    if (draft.status !== 'generating') {
      throw new AppError(400, `内容草稿状态为 ${draft.status}，无法生成`);
    }

    try {
      // Step 1: RAG retrieval
      const ragResult = await ragService.retrieve(clientId, draft.title, {
        limit: 5,
        minScore: 0.05,
      });

      // Build RAG context string
      const ragContext = ragResult.results.length > 0
        ? ragResult.results
            .map((r, i) => `[证据${i + 1} - ${r.category}] ${r.chunkText}`)
            .join('\n\n')
        : '（知识库中暂无直接相关证据，请根据通用知识回答，并提示用户信息可能不完全准确）';

      // Build fact refs for storage
      const factRefs = ragResult.results.map((r) => ({
        entryId: r.entryId,
        entryTitle: r.title,
        chunkIndex: r.chunkIndex,
        score: r.score,
      }));

      // Step 2: Build prompt
      const prompt = QA_GENERATION_PROMPT
        .replace('{title}', draft.title)
        .replace('{ragContext}', ragContext);

      // Step 3: AI generation with fallback
      const generated = await generateWithFallback(prompt, {
        temperature: 0.7,
        maxTokens: 4096,
      });

      // Step 4: Extract FAQ schema
      const schemaJson = generateFaqSchema(draft.title, generated);

      // Step 5: Estimate AI ratio and geo score
      const aiRatio = estimateAiRatio(generated, draft.title);
      const geoScore = estimateGeoScore(generated, factRefs.length);
      const words = generated.replace(/\s+/g, '').length; // Chinese char count

      // Step 6: Count Q&A pairs for orig research check
      const pairs = extractQAPairs(draft.title, generated);
      const origResearchTypes: string[] = [];
      if (pairs.length >= 3) origResearchTypes.push('multi_q_and_a');
      if (factRefs.length >= 2) origResearchTypes.push('fact_referenced');
      if (words > 1000) origResearchTypes.push('long_form');

      // Step 7: Update draft
      await prisma.contentDraft.update({
        where: { id: draftId },
        data: {
          content: generated,
          status: 'review',
          schemaJson,
          aiRatio,
          geoScore,
          words,
          factRefs,
          origResearchTypes,
          generationPrompt: prompt,
        },
      });
    } catch (err) {
      // Mark as draft on failure (operator can retry)
      await prisma.contentDraft.update({
        where: { id: draftId },
        data: { status: 'draft' },
      });
      throw err;
    }
  }

  /**
   * Estimate AI-generated content ratio (0-100).
   *
   * Simple heuristic: count unique words in generated text vs typical
   * AI output patterns. More accurate estimation could use a separate AI call.
   */
  function estimateAiRatio(content: string, title: string): number {
    // Simple heuristic based on content length
    // AI-generated content tends to be longer and more structured
    const totalChars = content.replace(/\s+/g, '').length;
    const titleChars = title.replace(/\s+/g, '').length;

    if (totalChars < 200) return 50; // Very short → possibly mixed
    if (totalChars < 500) return 70;

    // Longer content = more likely AI-generated
    const ratio = Math.min(100, 60 + Math.floor(totalChars / 50));
    return Math.min(100, Math.max(0, ratio));
  }

  /**
   * Estimate GEO quality score (0-100).
   *
   * Factors: RAG references count, word count, Q&A structure.
   */
  function estimateGeoScore(content: string, factRefCount: number): number {
    let score = 50; // Base score

    // RAG references: +10 per reference, max +30
    score += Math.min(30, factRefCount * 10);

    // Length bonus: adequate length for SEO
    const chars = content.replace(/\s+/g, '').length;
    if (chars >= 1500) score += 15;
    else if (chars >= 800) score += 10;
    else if (chars >= 400) score += 5;

    // Q&A structure bonus
    if (/Q[：:]|问[：:]|###\s+\S/i.test(content)) score += 5;

    return Math.min(100, score);
  }

  /**
   * Get draft with generation status.
   */
  async function getDraft(draftId: string, clientId: string) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, clientId },
      include: { reviews: { orderBy: { reviewedAt: 'desc' } } },
    });

    if (!draft) throw new AppError(404, '内容草稿不存在');

    return draft;
  }

  /**
   * List drafts with optional status filter.
   */
  async function listDrafts(
    clientId: string,
    options: { status?: string; page?: number; pageSize?: number },
  ) {
    const where: Record<string, unknown> = { clientId };
    if (options.status) where.status = options.status;

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const [items, total] = await Promise.all([
      prisma.contentDraft.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { reviews: { take: 1, orderBy: { reviewedAt: 'desc' } } },
      }),
      prisma.contentDraft.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Create a draft and enqueue generation.
   */
  async function createDraft(
    clientId: string,
    input: { title: string; format?: string },
  ) {
    const draft = await prisma.contentDraft.create({
      data: {
        clientId,
        title: input.title,
        format: input.format ?? 'qa',
        status: 'generating',
      },
    });

    return draft;
  }

  /**
   * Update draft content (only when status is draft or rejected).
   */
  async function updateDraft(
    draftId: string,
    clientId: string,
    input: { title?: string; content?: string },
  ) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, clientId },
    });

    if (!draft) throw new AppError(404, '内容草稿不存在');
    if (!['draft', 'rejected'].includes(draft.status)) {
      throw new AppError(400, `内容草稿状态为 ${draft.status}，无法编辑`);
    }

    return prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
      },
    });
  }

  /**
   * Delete a draft.
   */
  async function deleteDraft(draftId: string, clientId: string) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, clientId },
    });
    if (!draft) throw new AppError(404, '内容草稿不存在');

    await prisma.contentDraft.delete({ where: { id: draftId } });
  }

  return {
    generateContent,
    getDraft,
    listDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
  };
}
