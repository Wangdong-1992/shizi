/**
 * Embedding Generation Utility.
 *
 * Generates vector embeddings via the AI provider fallback chain.
 * Uses embedWithFallback from provider-factory.ts — tries OpenAI first,
 * then Gemini if OpenAI is unavailable or fails.
 */

import { embedWithFallback } from './ai-providers/provider-factory.js';

/**
 * Generate a 1536-dimensional embedding vector for a text string.
 *
 * @param text - The text to embed (max ~8191 tokens)
 * @returns A 1536-dimensional float array
 * @throws {Error} If all providers fail
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.length > 30000 ? text.slice(0, 30000) : text;
  if (!input.trim()) {
    return new Array(1536).fill(0);
  }

  const embedding = await embedWithFallback(input);

  // Pad or trim to 1536 dimensions
  if (embedding.length < 1536) {
    return [...embedding, ...new Array(1536 - embedding.length).fill(0)];
  }
  return embedding.slice(0, 1536);
}

/**
 * Generate embeddings for multiple texts.
 *
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors (same order as inputs)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}
