/**
 * Stage 1: Collector — Text Extraction.
 *
 * Extracts raw text from various input formats:
 *   - PDF: Uses pdf-parse for text extraction
 *   - Word (.docx): Uses mammoth for text extraction
 *   - URL: Uses fetch + cheerio for HTML text extraction
 *   - Image: Placeholder (OCR not implemented in Phase 2 MVP)
 *
 * All methods return plain text with minimal formatting preserved
 * (paragraph breaks, basic structure).
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Input types supported by the collector.
 */
export type InputType = 'pdf' | 'word' | 'url' | 'image';

/**
 * Result of text collection.
 */
export interface CollectorResult {
  /** Extracted raw text */
  rawText: string;
  /** Input type */
  inputType: InputType;
  /** File size in bytes (for file inputs) or content length (for URL) */
  sizeBytes: number;
  /** Source identifier (filename or URL) */
  source: string;
}

/**
 * Extract text from a PDF file.
 *
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text
 */
export async function collectFromPdf(filePath: string): Promise<CollectorResult> {
  const stat = await fs.stat(filePath);

  // Phase 2: Use pdf-parse for actual extraction
  // For now, attempt dynamic import; fall back to raw storage
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return {
      rawText: data.text,
      inputType: 'pdf',
      sizeBytes: stat.size,
      source: path.basename(filePath),
    };
  } catch {
    // Fallback: store raw content as text
    const raw = await fs.readFile(filePath, 'utf-8');
    return {
      rawText: raw,
      inputType: 'pdf',
      sizeBytes: stat.size,
      source: path.basename(filePath),
    };
  }
}

/**
 * Extract text from a Word (.docx) file.
 *
 * @param filePath - Absolute path to the .docx file
 * @returns Extracted text
 */
export async function collectFromWord(filePath: string): Promise<CollectorResult> {
  const stat = await fs.stat(filePath);

  try {
    const mammoth = await import('mammoth');
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return {
      rawText: result.value,
      inputType: 'word',
      sizeBytes: stat.size,
      source: path.basename(filePath),
    };
  } catch {
    // Fallback
    const raw = await fs.readFile(filePath, 'utf-8');
    return {
      rawText: raw,
      inputType: 'word',
      sizeBytes: stat.size,
      source: path.basename(filePath),
    };
  }
}

/**
 * Extract text from a URL (HTML page).
 *
 * @param url - The URL to fetch
 * @returns Extracted text
 */
export async function collectFromUrl(url: string): Promise<CollectorResult> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GEOPlatform/1.0 Knowledge Importer' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Simple HTML-to-text (no external dep needed for MVP)
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const contentLength = new TextEncoder().encode(html).length;

    return {
      rawText: text,
      inputType: 'url',
      sizeBytes: contentLength,
      source: url,
    };
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from an image (placeholder for OCR).
 *
 * @param _filePath - Absolute path to the image file
 * @returns Placeholder message
 */
export async function collectFromImage(_filePath: string): Promise<CollectorResult> {
  const stat = await fs.stat(_filePath);

  return {
    rawText: `[图片导入需人工录入: ${path.basename(_filePath)}]`,
    inputType: 'image',
    sizeBytes: stat.size,
    source: path.basename(_filePath),
  };
}

/**
 * Main dispatch: collect text based on input type.
 */
export async function collect(inputType: InputType, inputRef: string): Promise<CollectorResult> {
  switch (inputType) {
    case 'pdf':
      return collectFromPdf(inputRef);
    case 'word':
      return collectFromWord(inputRef);
    case 'url':
      return collectFromUrl(inputRef);
    case 'image':
      return collectFromImage(inputRef);
    default:
      throw new Error(`Unsupported input type: ${inputType}`);
  }
}
