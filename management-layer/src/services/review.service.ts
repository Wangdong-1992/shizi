/**
 * Human Review Service.
 *
 * Manages the 6-dimension review checklist workflow.
 *
 * Key constraint (强制执行):
 *   ✅ 审核通过/拒绝均不修改 ContentDraft.geoScore 和 aiRatio。
 *   ✅ 6 项 checklist 全部填写 + 审核人签名后才可提交。
 *   ❌ 不实现 Math.max(geo, 65) 或任何自动改分逻辑。
 */

import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/error.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  /** Whether this dimension passed */
  passed: boolean;
  /** Required reason when not passed */
  reason?: string;
}

export interface ChecklistResult {
  accuracy: ChecklistItem;     // 事实准确性
  gain: ChecklistItem;         // 原创研究标注
  brand: ChecklistItem;        // 品牌一致性
  compliance: ChecklistItem;   // 合规性
  eeat: ChecklistItem;         // E-E-A-T
  readability: ChecklistItem;  // 可读性
}

const CHECKLIST_DIMENSIONS = ['accuracy', 'gain', 'brand', 'compliance', 'eeat', 'readability'] as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ReviewServiceDeps {
  prisma: PrismaClient;
}

export function createReviewService(deps: ReviewServiceDeps) {
  const { prisma } = deps;

  /**
   * Submit a human review for a content draft.
   *
   * Flow:
   *   1. Validate: 6 items all filled, signature non-empty
   *   2. For failed items, reason is required
   *   3. Create HumanReview record (snapshot aiRatio)
   *   4. Update ContentDraft.status → 'approved' | 'rejected'
   *   5. geoScore and aiRatio are NEVER modified
   */
  async function submitReview(
    draftId: string,
    clientId: string,
    operatorId: string,
    checklist: ChecklistResult,
    signature: string,
  ): Promise<{ passed: boolean; reviewId: string }> {
    // Validate checklist
    validateChecklist(checklist);

    // Validate signature
    if (!signature.trim()) {
      throw new AppError(400, '审核人签名不能为空');
    }

    // Load draft — P0-9 FIX: include clientId filter to prevent cross-tenant review
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, clientId },
    });

    if (!draft) {
      throw new AppError(404, '内容草稿不存在');
    }

    if (draft.status !== 'review') {
      throw new AppError(400, `内容草稿状态为 ${draft.status}，无法审核`);
    }

    // Determine overall result
    const allPassed = CHECKLIST_DIMENSIONS.every((dim) => checklist[dim].passed);

    // Create review record
    const review = await prisma.humanReview.create({
      data: {
        draftId,
        operatorId,
        checklist,
        signature: signature.trim(),
        aiRatioAtReview: draft.aiRatio,
        passed: allPassed,
      },
    });

    // Update draft status — CRITICAL: do NOT modify geoScore or aiRatio
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        status: allPassed ? 'approved' : 'rejected',
      },
    });

    return {
      passed: allPassed,
      reviewId: review.id,
    };
  }

  /**
   * Get review history for a draft.
   */
  async function getReviews(draftId: string) {
    return prisma.humanReview.findMany({
      where: { draftId },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  return {
    submitReview,
    getReviews,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateChecklist(checklist: unknown): asserts checklist is ChecklistResult {
  if (typeof checklist !== 'object' || checklist === null) {
    throw new AppError(400, '审核清单格式无效');
  }

  const c = checklist as Record<string, unknown>;

  for (const dim of CHECKLIST_DIMENSIONS) {
    const item = c[dim];

    if (!item || typeof item !== 'object') {
      throw new AppError(400, `缺少审核维度: ${dim}`);
    }

    const i = item as Record<string, unknown>;

    if (typeof i.passed !== 'boolean') {
      throw new AppError(400, `审核维度 ${dim} 缺少 passed 字段`);
    }

    // If not passed, reason is required
    if (!i.passed && (!i.reason || String(i.reason).trim().length === 0)) {
      throw new AppError(400, `审核维度 ${dim} 未通过时必须填写原因`);
    }
  }
}
