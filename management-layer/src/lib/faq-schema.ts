/**
 * FAQPage JSON-LD Schema Generator.
 *
 * Extracts Q&A pairs from generated content and produces a
 * Schema.org FAQPage JSON-LD object for SEO enhancement.
 *
 * @see https://schema.org/FAQPage
 */

export interface FaqQAPair {
  question: string;
  answer: string;
}

/**
 * Extract Q&A pairs from content text.
 * Simple heuristic: finds patterns like "Q: ..." or "问：..."/"答：..."
 * Also handles markdown headers as question indicators.
 *
 * @param title - The article/question title
 * @param content - The full content text
 * @returns Array of Q&A pairs
 */
export function extractQAPairs(title: string, content: string): FaqQAPair[] {
  const pairs: FaqQAPair[] = [];
  let currentQuestion = '';
  let currentAnswer = '';

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match Q: / 问：/ ### patterns
    const qMatch = /^(?:Q[：:]|问[：:]|###\s*)/i.exec(trimmed);
    if (qMatch) {
      // Save previous pair
      if (currentQuestion && currentAnswer) {
        pairs.push({ question: currentQuestion, answer: currentAnswer.trim() });
      }
      currentQuestion = trimmed.slice(qMatch[0].length).trim();
      currentAnswer = '';
      continue;
    }

    // Match A: / 答：patterns
    const aMatch = /^(?:A[：:]|答[：:])/i.exec(trimmed);
    if (aMatch) {
      currentAnswer = trimmed.slice(aMatch[0].length).trim();
      continue;
    }

    // Accumulate answer text
    if (currentQuestion && trimmed) {
      currentAnswer = currentAnswer ? currentAnswer + '\n' + trimmed : trimmed;
    }
  }

  // Save last pair
  if (currentQuestion && currentAnswer) {
    pairs.push({ question: currentQuestion, answer: currentAnswer.trim() });
  }

  // Fallback: treat title as main question, full content as answer
  if (pairs.length === 0) {
    pairs.push({
      question: title,
      answer: content.slice(0, 1500),
    });
  }

  return pairs;
}

/**
 * Generate a Schema.org FAQPage JSON-LD object.
 *
 * @param title - Page title (optional, used if no Q&A extracted)
 * @param content - Full generated content
 * @returns FAQPage schema object
 */
export function generateFaqSchema(title: string, content: string): object {
  const pairs = extractQAPairs(title, content);

  const mainEntity = pairs.map((pair) => ({
    '@type': 'Question' as const,
    name: pair.question,
    acceptedAnswer: {
      '@type': 'Answer' as const,
      text: pair.answer,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
}

/**
 * Validate that a FAQ schema has at least one Q&A pair.
 */
export function isValidFaqSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const s = schema as Record<string, unknown>;
  if (s['@type'] !== 'FAQPage') return false;
  const entities = s.mainEntity as Array<unknown> | undefined;
  return Array.isArray(entities) && entities.length > 0;
}
