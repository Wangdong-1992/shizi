/**
 * AI Provider Factory & Fallback Chain.
 *
 * Creates AI providers in priority order: OpenAI → Gemini.
 *
 * Fallback chain: if the primary provider fails (API error, timeout),
 * the next provider in the chain is tried automatically.
 *
 * Usage:
 *   const text = await generateWithFallback(prompt, options);
 *   // Tries OpenAI first, falls back to Gemini if OpenAI fails.
 */

import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import type { AIProvider, GenerateOptions } from './base.js';

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/**
 * Create an AI provider by name.
 *
 * Priority order built into the system:
 *   1. OpenAI (if OPENAI_API_KEY is set)
 *   2. Gemini  (if GEMINI_API_KEY is set)
 *
 * @param name - Provider name ('openai' | 'gemini')
 * @returns AIProvider instance
 */
export function createProvider(name: 'openai' | 'gemini'): AIProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}

/**
 * Get the best available provider based on configured API keys.
 * Returns the first provider that has its API key set.
 */
export function getBestProvider(): AIProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiProvider();
  }
  // Fallback: return OpenAI (will throw on actual use if no key)
  return new OpenAIProvider();
}

/**
 * Get all available providers (those with API keys configured).
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (process.env.OPENAI_API_KEY) providers.push(new OpenAIProvider());
  if (process.env.GEMINI_API_KEY) providers.push(new GeminiProvider());
  return providers;
}

// ---------------------------------------------------------------------------
// Fallback Chain
// ---------------------------------------------------------------------------

/**
 * Generate text with automatic fallback across providers.
 *
 * Algorithm:
 *   1. Try primary provider (first available)
 *   2. On failure, try each subsequent provider
 *   3. If all fail, throw the last error
 *
 * @param prompt - The prompt text
 * @param options - Generation options
 * @returns Generated text
 */
export async function generateWithFallback(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  const providers = getAvailableProviders();

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.');
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`[ai] Trying ${provider.name}...`);
      const result = await provider.generateText(prompt, options);
      console.log(`[ai] ${provider.name} succeeded`);
      return result;
    } catch (err) {
      console.warn(`[ai] ${provider.name} failed:`, err instanceof Error ? err.message : 'Unknown error');
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next provider
    }
  }

  throw new Error(
    `All ${providers.length} AI provider(s) failed. Last error: ${lastError?.message}`,
  );
}

/**
 * Generate embeddings with automatic fallback.
 *
 * @param text - The text to embed
 * @returns Embedding vector
 */
export async function embedWithFallback(text: string): Promise<number[]> {
  const providers = getAvailableProviders();

  if (providers.length === 0) {
    throw new Error('No AI provider configured.');
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      return await provider.embedText(text);
    } catch (err) {
      console.warn(`[ai] ${provider.name} embed failed`);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`All providers failed for embedding. Last error: ${lastError?.message}`);
}
