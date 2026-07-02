/**
 * Google Gemini AI Provider Implementation.
 *
 * Implements the AIProvider interface using Google Generative AI SDK:
 *   - embedText → text-embedding-004 (768 dimensions)
 *   - generateText → gemini-1.5-flash (fast/cheap) or gemini-1.5-pro (high quality)
 *
 * Requires: GEMINI_API_KEY environment variable.
 */

import type { AIProvider, GenerateOptions } from './base.js';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';
const DEFAULT_FLASH_MODEL = 'gemini-1.5-flash';
const DEFAULT_PRO_MODEL = 'gemini-1.5-pro';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? '';
  }

  /**
   * Generate a 768-dimensional embedding vector using text-embedding-004.
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.apiKey) {
      console.warn('[Gemini] API key not configured, returning zero vector');
      return new Array(768).fill(0);
    }

    const input = text.length > 30000 ? text.slice(0, 30000) : text;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_EMBEDDING_MODEL}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${DEFAULT_EMBEDDING_MODEL}`,
          content: { parts: [{ text: input }] },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini Embedding error (${response.status}): ${errorBody}`);
    }

    const body = await response.json() as {
      embedding: { values: number[] };
    };

    return body.embedding?.values ?? new Array(768).fill(0);
  }

  /**
   * Generate text using Gemini.
   * Uses gemini-1.5-flash by default for speed/cost; pro for high-quality.
   *
   * @param prompt - The prompt text
   * @param options - Generation options
   */
  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = options.model ?? DEFAULT_FLASH_MODEL;
    const systemPrompt = options.systemPrompt;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini Chat error (${response.status}): ${errorBody}`);
    }

    const body = await response.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    return body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
