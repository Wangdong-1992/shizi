/**
 * OpenAI AI Provider Implementation.
 *
 * Implements the AIProvider interface using OpenAI's API:
 *   - embedText → text-embedding-3-small (1536 dimensions)
 *   - generateText → gpt-4o (T2.4 content generation)
 */

import type { AIProvider, GenerateOptions } from './base.js';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_CHAT_MODEL = 'gpt-4o';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = baseUrl ?? 'https://api.openai.com/v1';
  }

  /**
   * Generate a 1536-dimensional embedding vector.
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.apiKey) {
      console.warn('[OpenAI] API key not configured, returning zero vector');
      return new Array(1536).fill(0);
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_EMBEDDING_MODEL,
        input: text.length > 30000 ? text.slice(0, 30000) : text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI Embedding error (${response.status}): ${errorBody}`);
    }

    const body = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    if (!body.data?.[0]?.embedding) {
      throw new Error('OpenAI Embedding returned no data');
    }

    return body.data[0].embedding;
  }

  /**
   * Generate a text completion using the chat API.
   * Used in T2.4 for article generation, review generation, etc.
   */
  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? DEFAULT_CHAT_MODEL,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI Chat error (${response.status}): ${errorBody}`);
    }

    const body = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return body.choices?.[0]?.message?.content ?? '';
  }
}

/** Singleton instance (lazy, respects OPENAI_API_KEY env var). */
let _instance: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
  if (!_instance) {
    _instance = new OpenAIProvider();
  }
  return _instance;
}
