/**
 * AI Provider Interface.
 *
 * Defines the contract for AI service integration (embedding + text generation).
 * Implementations exist for OpenAI (see ai-providers/openai.ts).
 * Future providers (Azure, Anthropic, local models) implement this interface.
 */

export interface AIProvider {
  /** Unique provider name for logging/configuration */
  readonly name: string;

  /**
   * Generate a vector embedding for a text string.
   * Used for knowledge base chunking → vector index → RAG retrieval.
   *
   * @param text - The text to embed
   * @returns A float32 vector (timensions depend on provider/model)
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Generate a text completion from a prompt.
   * Used for content generation (T2.4).
   *
   * @param prompt - The prompt text
   * @param options - Optional generation parameters
   * @returns Generated text
   */
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
}

/** Options for text generation. */
export interface GenerateOptions {
  /** Model override (default: gpt-4o) */
  model?: string;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Temperature for sampling (0-2, default: 0.7) */
  temperature?: number;
  /** System message to set behavior */
  systemPrompt?: string;
}
