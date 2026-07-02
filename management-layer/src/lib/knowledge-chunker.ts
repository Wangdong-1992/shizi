/**
 * Text Chunker — Splits long content into overlapping chunks for embedding.
 *
 * Simple paragraph-based splitting with token-aware overlap.
 * For MVP, we use paragraph boundaries plus a rough token estimate
 * (1 token ≈ 4 characters for Chinese/English mixed text).
 *
 * Future: Can be upgraded to use langchain's MarkdownTextSplitter or
 * a tokenizer-aware chunker for more precise splitting.
 */

/**
 * Estimated token ratio for mixed Chinese/English text.
 * Conservative estimate: ~2.5 chars per token for CJK-heavy text.
 */
const CHARS_PER_TOKEN = 2.5;

export interface ContentChunk {
  /** Zero-based chunk index */
  chunkIndex: number;
  /** The chunk text content */
  chunkText: string;
  /** Estimated token count */
  tokenCount: number;
}

/**
 * Split content text into overlapping chunks.
 *
 * Algorithm:
 *   1. Split by double-newline (paragraph boundaries)
 *   2. Merge short paragraphs to avoid tiny chunks
 *   3. Slide a window of maxTokens with overlap across the merged paragraphs
 *
 * @param content - The full text content to split
 * @param maxTokens - Maximum tokens per chunk (default: 800)
 * @param overlapTokens - Overlap between consecutive chunks (default: 100)
 * @returns Array of chunks with index and token count
 */
export function chunkContent(
  content: string,
  maxTokens: number = 800,
  overlapTokens: number = 100,
): ContentChunk[] {
  if (!content.trim()) {
    return [];
  }

  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  const overlapChars = Math.floor(overlapTokens * CHARS_PER_TOKEN);

  // Step 1: Split by paragraphs
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Step 2: Merge short paragraphs into larger segments
  const segments: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length > maxChars && buffer.length > 0) {
      segments.push(buffer.trim());
      buffer = para;
    } else {
      buffer = buffer ? buffer + '\n\n' + para : para;
    }
  }
  if (buffer.trim()) {
    segments.push(buffer.trim());
  }

  // Step 3: Create overlapping chunks from segments
  const chunks: ContentChunk[] = [];
  let chunkIndex = 0;

  for (const segment of segments) {
    if (segment.length <= maxChars) {
      // Segment fits in a single chunk
      const tokenCount = Math.ceil(segment.length / CHARS_PER_TOKEN);
      chunks.push({
        chunkIndex: chunkIndex++,
        chunkText: segment,
        tokenCount,
      });
    } else {
      // Long segment: slide a window with overlap
      let start = 0;
      while (start < segment.length) {
        const end = Math.min(start + maxChars, segment.length);
        const chunkText = segment.slice(start, end);
        const tokenCount = Math.ceil(chunkText.length / CHARS_PER_TOKEN);

        chunks.push({
          chunkIndex: chunkIndex++,
          chunkText,
          tokenCount,
        });

        if (end >= segment.length) {
          break;
        }

        // Move the window: advance by (maxChars - overlapChars)
        start = start + maxChars - overlapChars;

        // Ensure we make forward progress
        if (start <= 0 || start >= segment.length) {
          break;
        }
      }
    }
  }

  return chunks;
}
