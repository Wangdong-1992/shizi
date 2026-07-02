/**
 * Unit Tests — AI Crawler Detector Plugin.
 *
 * Tests the UA regex matching logic for 6 known AI crawlers,
 * IP anonymization, and edge cases.
 *
 * Run with: npx vitest test/crawler-detector.test.ts
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Replicate the core logic from crawler-detector.ts for unit testing
// (the plugin itself needs a Fastify instance, so we test the pure functions)
// ---------------------------------------------------------------------------

const CRAWLER_PATTERNS: Record<string, RegExp> = {
  gptbot: /GPTBot/i,
  googlebot: /Googlebot/i,
  claudebot: /ClaudeBot|anthropic/i,
  bytespider: /Bytespider/i,
  bingbot: /bingbot/i,
  commoncrawl: /CCBot/i,
};

function detectCrawler(ua: string): string | null {
  if (!ua) return null;
  for (const [name, pattern] of Object.entries(CRAWLER_PATTERNS)) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function detectCrawlerOrOther(ua: string): string | null {
  if (!ua) return null;
  let crawler = detectCrawler(ua);
  if (!crawler && /bot|spider|crawler|scraper/i.test(ua)) {
    crawler = 'other';
  }
  return crawler;
}

function anonymizeIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return ip;
}

// ============================================================================
// Known AI Crawler Detection
// ============================================================================
describe('detectCrawler — 6 known AI crawlers', () => {
  it('detects GPTBot', () => {
    expect(detectCrawler('Mozilla/5.0 GPTBot/1.0')).toBe('gptbot');
    expect(detectCrawler('gptbot/2.0 (openai)')).toBe('gptbot');
  });

  it('detects Googlebot', () => {
    expect(detectCrawler('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe('googlebot');
    // Googlebot-Image, Googlebot-News should also match due to partial regex
    expect(detectCrawler('Googlebot-Image/1.0')).toBe('googlebot');
    expect(detectCrawler('Googlebot-News')).toBe('googlebot');
  });

  it('detects ClaudeBot (including Anthropic)', () => {
    expect(detectCrawler('ClaudeBot/1.0')).toBe('claudebot');
    expect(detectCrawler('anthropic-ai/1.0')).toBe('claudebot');
    expect(detectCrawler('Mozilla/5.0 ClaudeBot/2.0')).toBe('claudebot');
  });

  it('detects Bytespider (ByteDance)', () => {
    expect(detectCrawler('Bytespider/1.0')).toBe('bytespider');
    expect(detectCrawler('Mozilla/5.0 (compatible; Bytespider)')).toBe('bytespider');
  });

  it('detects Bingbot', () => {
    expect(detectCrawler('bingbot/2.0')).toBe('bingbot');
    expect(detectCrawler('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe('bingbot');
  });

  it('detects CCBot (Common Crawl)', () => {
    expect(detectCrawler('CCBot/2.0')).toBe('commoncrawl');
    expect(detectCrawler('Mozilla/5.0 CCBot/2.0 (commoncrawl.org)')).toBe('commoncrawl');
  });
});

// ============================================================================
// Fallback "other" Bot Detection
// ============================================================================
describe('detectCrawlerOrOther — unknown bots', () => {
  it('classifies unknown bots as "other"', () => {
    expect(detectCrawlerOrOther('YandexBot/3.0')).toBe('other');
    expect(detectCrawlerOrOther('DuckDuckBot/1.0')).toBe('other');
    expect(detectCrawlerOrOther('AhrefsBot/7.0')).toBe('other');
    expect(detectCrawlerOrOther('SemrushBot/2.0')).toBe('other');
  });

  it('classifies generic spider/crawler/scraper as "other"', () => {
    expect(detectCrawlerOrOther('my-custom-spider/1.0')).toBe('other');
    expect(detectCrawlerOrOther('web-crawler/2.0')).toBe('other');
    expect(detectCrawlerOrOther('content-scraper/3.0')).toBe('other');
  });

  it('returns null for normal browser UAs', () => {
    expect(detectCrawlerOrOther('Mozilla/5.0 Chrome/120.0')).toBeNull();
    expect(detectCrawlerOrOther('Mozilla/5.0 Safari/605.1')).toBeNull();
    expect(detectCrawlerOrOther('curl/8.0')).toBeNull();
  });

  it('returns null for empty UA', () => {
    expect(detectCrawler('')).toBeNull();
    expect(detectCrawlerOrOther('')).toBeNull();
  });
});

// ============================================================================
// IP Anonymization
// ============================================================================
describe('anonymizeIp', () => {
  it('anonymizes IPv4 to /24 subnet', () => {
    expect(anonymizeIp('192.168.1.100')).toBe('192.168.1.0');
    expect(anonymizeIp('10.0.0.1')).toBe('10.0.0.0');
    expect(anonymizeIp('172.16.254.5')).toBe('172.16.254.0');
  });

  it('passes through non-IPv4 addresses', () => {
    expect(anonymizeIp('::1')).toBe('::1');
    expect(anonymizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('handles edge cases', () => {
    expect(anonymizeIp('0.0.0.0')).toBe('0.0.0.0');
    expect(anonymizeIp('255.255.255.255')).toBe('255.255.255.0');
  });
});

// ============================================================================
// Edge Cases & Robustness
// ============================================================================
describe('Crawler detection edge cases', () => {
  it('case-insensitive matching', () => {
    expect(detectCrawler('gptbot')).toBe('gptbot');
    expect(detectCrawler('GPTBOT')).toBe('gptbot');
    expect(detectCrawler('GptBot')).toBe('gptbot');
    expect(detectCrawler('BINGBOT/2.0')).toBe('bingbot');
    expect(detectCrawler('ClAuDeBoT')).toBe('claudebot');
  });

  it('first match wins (ordering matters)', () => {
    // If a UA matches multiple patterns, first in iteration order takes priority
    // gptbot comes before googlebot in CRAWLER_PATTERNS
    const ua = 'GPTBot/1.0 Googlebot/2.0';
    expect(detectCrawler(ua)).toBe('gptbot');
  });

  it('handles very long UAs gracefully', () => {
    const longUa = 'Mozilla/5.0 ' + 'x'.repeat(500) + ' GPTBot/1.0';
    expect(detectCrawler(longUa)).toBe('gptbot');
  });
});
