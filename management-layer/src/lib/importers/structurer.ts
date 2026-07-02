/**
 * Stage 3: Structurer — Knowledge Entry Structuring.
 *
 * Splits cleaned text into categorized knowledge entries using AI.
 *
 * Primary path: AI structuring (GPT-4o).
 * Fallback path: Keyword-based category matching.
 */

import { OpenAIProvider } from '../ai-providers/openai.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '../../schemas/knowledge.schema.js';

const STRUCTURING_PROMPT = `将以下文本按分类拆分为知识条目。分类包括：
- enterprise_info（企业信息）
- product_info（产品信息）
- process（工艺流程）
- certification（资质认证）
- faq（常见问答）
- industry_knowledge（行业知识）
- contact（联系方式）
- news（新闻动态）
- customer_case（客户案例）
- core_attributes（核心属性）

每条包含 title 和 content。以 JSON 数组格式返回，格式严格为：
[{"title": "...", "category": "category_key", "content": "...", "confidence": 0.0-1.0}]

只返回 JSON 数组，不要添加任何解释或 Markdown 代码块标记。`;

export interface StructuredEntry {
  /** Entry title */
  title: string;
  /** Knowledge category */
  category: KnowledgeCategory | string;
  /** Entry content */
  content: string;
  /** AI confidence score (0-1) */
  confidence: number;
}

export interface StructurerResult {
  /** Structured entries */
  entries: StructuredEntry[];
  /** Method used: 'ai' | 'fallback-template' */
  method: 'ai' | 'fallback-template';
}

/**
 * AI-based structuring.
 */
async function structureWithAI(cleanText: string): Promise<StructuredEntry[]> {
  const provider = new OpenAIProvider();
  const maxInput = 10000;

  const input = cleanText.length > maxInput
    ? cleanText.slice(0, maxInput) + '\n\n[文本过长，已截断...]'
    : cleanText;

  const result = await provider.generateText(
    `${STRUCTURING_PROMPT}\n\n文本：\n${input}`,
    { temperature: 0.2, maxTokens: 4096 },
  );

  // Parse JSON array from AI response
  let jsonStr = result.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const entries = JSON.parse(jsonStr) as StructuredEntry[];
    return entries.map((e) => ({
      title: e.title || '未命名条目',
      category: KNOWLEDGE_CATEGORIES.includes(e.category as KnowledgeCategory) ? e.category : 'enterprise_info',
      content: e.content || '',
      confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0.5)),
    }));
  } catch {
    // If JSON parsing fails, treat entire text as one entry
    return [{
      title: '导入内容',
      category: 'enterprise_info',
      content: cleanText,
      confidence: 0.3,
    }];
  }
}

// ---------------------------------------------------------------------------
// Fallback: Keyword-based category matching
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  enterprise_info: ['企业', '公司', '品牌', '介绍', '成立', '注册', '法人'],
  product_info: ['产品', '商品', '规格', '型号', '成分', '配料'],
  process: ['工艺', '流程', '制作', '生产', '加工', '步骤', '方法'],
  certification: ['认证', '资质', '证书', 'ISO', 'HACCP', '标准', '检测', '检验'],
  faq: ['常见', '问答', '怎么', '如何', '什么', '为什么'],
  industry_knowledge: ['行业', '市场', '趋势', '数据', '报告', '研究'],
  contact: ['联系', '电话', '地址', '邮箱', '邮编', '网址'],
  news: ['新闻', '动态', '公告', '通知', '活动', '发布'],
  customer_case: ['案例', '客户', '合作', '成功', '应用', '方案'],
  core_attributes: ['属性', '特征', '参数', '核心', '规格'],
};

function matchCategoryByKeywords(text: string): KnowledgeCategory {
  const textLower = text.toLowerCase();
  let bestCategory: KnowledgeCategory = 'enterprise_info';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => textLower.includes(kw.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as KnowledgeCategory;
    }
  }

  return bestCategory;
}

/**
 * Fallback: split by double-newline, categorize each paragraph.
 */
function structureWithRules(cleanText: string): StructuredEntry[] {
  const paragraphs = cleanText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  if (paragraphs.length === 0) {
    return [{
      title: '导入内容',
      category: 'enterprise_info',
      content: cleanText,
      confidence: 0.2,
    }];
  }

  return paragraphs.map((para, i) => ({
    title: para.slice(0, 60) + (para.length > 60 ? '...' : ''),
    category: matchCategoryByKeywords(para),
    content: para,
    confidence: 0.3,
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Structure cleaned text into categorized knowledge entries.
 * Tries AI first, falls back to keyword matching.
 */
export async function structure(cleanText: string): Promise<StructurerResult> {
  let entries: StructuredEntry[];
  let method: 'ai' | 'fallback-template' = 'ai';

  try {
    entries = await structureWithAI(cleanText);
    if (entries.length === 0 || entries[0].content === cleanText) {
      throw new Error('AI returned insufficient structure');
    }
  } catch (err) {
    console.warn('[structurer] AI structuring failed, using fallback:', err);
    entries = structureWithRules(cleanText);
    method = 'fallback-template';
  }

  return { entries, method };
}
