/**
 * Knowledge Entry Zod Schemas.
 *
 * Validates request bodies and query parameters for knowledge CRUD routes.
 */

import { z } from 'zod';

/**
 * All 10 knowledge categories as defined in the system design.
 */
export const KNOWLEDGE_CATEGORIES = [
  'enterprise_info',
  'product_info',
  'process',
  'certification',
  'faq',
  'industry_knowledge',
  'contact',
  'news',
  'customer_case',
  'core_attributes',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/**
 * Category display labels (Chinese).
 */
export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  enterprise_info: '企业信息',
  product_info: '产品信息',
  process: '工艺流程',
  certification: '资质认证',
  faq: '常见问答',
  industry_knowledge: '行业知识',
  contact: '联系方式',
  news: '新闻动态',
  customer_case: '客户案例',
  core_attributes: '核心属性',
};

/**
 * Create knowledge entry request body.
 */
export const createKnowledgeSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(500, '标题不能超过 500 字符'),
  category: z.enum(KNOWLEDGE_CATEGORIES, { message: '无效的分类' }),
  content: z.string().min(1, '内容不能为空'),
  contentHtml: z.string().optional(),
  source: z.string().max(1000, '来源不能超过 1000 字符').optional(),
  confidence: z.number().min(0).max(1).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Update knowledge entry request body (all fields optional).
 */
export const updateKnowledgeSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(500, '标题不能超过 500 字符').optional(),
  category: z.enum(KNOWLEDGE_CATEGORIES, { message: '无效的分类' }).optional(),
  content: z.string().min(1, '内容不能为空').optional(),
  contentHtml: z.string().optional(),
  source: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Knowledge list query parameters.
 */
export const knowledgeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().optional(),
});

/**
 * Types inferred from schemas.
 */
export type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;
export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;
export type KnowledgeQuery = z.infer<typeof knowledgeQuerySchema>;

/**
 * Knowledge entry API response shape.
 */
export interface KnowledgeResponse {
  id: string;
  clientId: string;
  category: string;
  title: string;
  content: string;
  contentHtml: string | null;
  source: string | null;
  confidence: number | null;
  riskLevel: string | null;
  version: number;
  status: string;
  publishedAt: string | null;
  geoflowKbId: string | null;
  geoflowSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Category statistics response shape.
 */
export interface CategoryStats {
  category: string;
  label: string;
  total: number;
  draft: number;
  published: number;
}
