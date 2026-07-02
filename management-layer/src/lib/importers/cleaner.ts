/**
 * Stage 2: Cleaner — Text Cleaning & De-noising.
 *
 * Removes noise (headers, footers, boilerplate, ads, duplicates) from
 * raw extracted text, producing clean content suitable for structuring.
 *
 * Primary path: AI cleaning (via OpenAI).
 * Fallback path: Regex-based rule cleaning.
 */

import { OpenAIProvider } from '../ai-providers/openai.js';

const CLEANING_PROMPT = `去除以下文本中的页眉页脚、模板文字、广告内容和重复段落，保留事实陈述和数据。只返回清洗后的文本，不要添加任何解释。`;

export interface CleanerResult {
  /** Cleaned text */
  cleanText: string;
  /** Original text (for comparison) */
  originalText: string;
  /** Method used: 'ai' | 'fallback-regex' */
  method: 'ai' | 'fallback-regex';
  /** Reduction ratio (clean length / original length) */
  reductionRatio: number;
}

/**
 * AI-based text cleaning.
 *
 * @param rawText - The raw extracted text
 * @returns Cleaned text result
 */
async function cleanWithAI(rawText: string): Promise<string> {
  const provider = new OpenAIProvider();
  const maxInput = 12000; // gpt-4o context window safety margin

  const input = rawText.length > maxInput
    ? rawText.slice(0, maxInput) + '\n\n[文本过长，已截断...]'
    : rawText;

  const result = await provider.generateText(
    `${CLEANING_PROMPT}\n\n${input}`,
    { temperature: 0.1, maxTokens: 4096 },
  );

  return result.trim();
}

/**
 * Regex-based rule cleaning (fallback).
 *
 * Removes common patterns:
 *   - Lines that are entirely uppercase (headers)
 *   - Page number patterns
 *   - URL patterns
 *   - Repeated blank lines
 *   - Trailing whitespace
 */
function cleanWithRules(rawText: string): string {
  return rawText
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // Skip all-uppercase short lines (headers)
      if (trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return false;
      // Skip page numbers
      if (/^\s*\d{1,4}\s*$/.test(trimmed)) return false;
      return true;
    })
    .map((line) => {
      // Remove URLs
      let cleaned = line.replace(/https?:\/\/[^\s]+/g, '');
      // Full-width to half-width conversion for common punctuation
      cleaned = cleaned
        .replace(/\u3000/g, ' ')
        .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
      return cleaned.trim();
    })
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Main clean function: tries AI first, falls back to regex rules.
 *
 * @param rawText - The raw extracted text (from collector)
 * @returns Cleaned result
 */
export async function clean(rawText: string): Promise<CleanerResult> {
  let cleanText: string;
  let method: 'ai' | 'fallback-regex' = 'ai';

  try {
    cleanText = await cleanWithAI(rawText);
    // If AI returned nothing meaningful, fall back
    if (!cleanText || cleanText.length < rawText.length * 0.05) {
      throw new Error('AI returned insufficient text');
    }
  } catch (err) {
    console.warn('[cleaner] AI cleaning failed, using regex fallback:', err);
    cleanText = cleanWithRules(rawText);
    method = 'fallback-regex';
  }

  const reductionRatio = rawText.length > 0
    ? cleanText.length / rawText.length
    : 1;

  return {
    cleanText,
    originalText: rawText,
    method,
    reductionRatio,
  };
}
