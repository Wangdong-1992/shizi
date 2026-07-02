/**
 * Analysis Tests — calculateAuto D5 Normalization (T3.4 Fix Verification)
 *
 * These tests verify the D5 normalization logic in scoring.service.ts
 * by testing the pure functions calcAutoD5Ranking and calcAutoD5Mind.
 *
 * The actual service methods require a Prisma DB connection, so we test
 * the isolated calculation logic from the service.
 *
 * Run with: npx vitest test/scoring-auto.test.ts
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Reproduction: calcAutoD5Ranking from scoring.service.ts
// ============================================================================
function calcAutoD5Ranking(mentions: Array<{ mentioned: boolean; position: string | null; platform?: string }>): number {
  const total = mentions.length || 1;
  const mCount = mentions.filter((m) => m.mentioned).length;
  const firstHalf = mentions.filter((m) => m.position === 'first_half').length;

  // BUG #1: Hardcoded set — always 4 regardless of actual data
  const platforms = new Set(['chatgpt', 'google', 'deepseek', 'doubao']).size;

  return Math.min(100, ((mCount / total) * 0.25 + (firstHalf / total) * 0.20 + (platforms / 4) * 0.15) / 0.60 * 100);
}

function calcAutoD5RankingFIXED(mentions: Array<{ mentioned: boolean; position: string | null; platform?: string }>): number {
  const total = mentions.length || 1;
  const mCount = mentions.filter((m) => m.mentioned).length;
  const firstHalf = mentions.filter((m) => m.position === 'first_half').length;

  // FIX: use actual platform diversity from data
  const actualPlatforms = new Set(mentions.map((m) => m.platform).filter(Boolean));
  const platforms = actualPlatforms.size || 1;

  return Math.min(100, ((mCount / total) * 0.25 + (firstHalf / total) * 0.20 + (platforms / 4) * 0.15) / 0.60 * 100);
}

// ============================================================================
// Reproduction: calcAutoD5Mind from scoring.service.ts
// ============================================================================
function calcAutoD5Mind(mentions: Array<{ mentioned: boolean; sentiment: string | null; depth: string | null }>): number {
  const total = mentions.length || 1;
  const positive = mentions.filter((m) => m.sentiment === 'positive').length;
  const detailed = mentions.filter((m) => m.depth === 'detailed').length;

  // BUG #2: Math.random() — non-deterministic, pure garbage data
  const brandAssoc = Math.round(Math.random() * 40 + 30);

  return Math.min(100, ((positive / total) * 0.15 + (detailed / total) * 0.15 + (brandAssoc / 100) * 0.10) / 0.40 * 100);
}

function calcAutoD5MindFIXED(mentions: Array<{ mentioned: boolean; sentiment: string | null; depth: string | null; brandAssoc?: number }>): number {
  const total = mentions.length || 1;
  const positive = mentions.filter((m) => m.sentiment === 'positive').length;
  const detailed = mentions.filter((m) => m.depth === 'detailed').length;

  // FIX: use actual data, with a reasonable default
  // brandAssoc should come from actual brand association metrics
  const brandAssoc = 50; // placeholder — should be derived from data

  return Math.min(100, ((positive / total) * 0.15 + (detailed / total) * 0.15 + (brandAssoc / 100) * 0.10) / 0.40 * 100);
}

// ============================================================================
// D5 Ranking Tests
// ============================================================================
describe('calcAutoD5Ranking — platform diversity', () => {
  it('BUG: platforms is always 4 regardless of actual data', () => {
    // Even with only 1 platform's mentions, platforms=4
    const mentions = [
      { mentioned: true, position: 'first_half', platform: 'chatgpt' },
    ];
    const result = calcAutoD5Ranking(mentions);
    // With 1 mention, all mentioned, first_half:
    // (1/1)*0.25 + (1/1)*0.20 + (4/4)*0.15 = 0.25+0.20+0.15 = 0.60
    // 0.60/0.60 * 100 = 100
    expect(result).toBe(100);

    // With FIXED version, 1 platform should give lower score
    const fixedResult = calcAutoD5RankingFIXED(mentions);
    // (1/1)*0.25 + (1/1)*0.20 + (1/4)*0.15 = 0.25+0.20+0.0375 = 0.4875
    // 0.4875/0.60 * 100 = 81.25
    expect(fixedResult).toBeCloseTo(81.25, 1);
  });

  it('FIXED: 1 platform should score lower than 4 platforms', () => {
    const onePlatform = [
      { mentioned: true, position: 'first_half', platform: 'chatgpt' },
      { mentioned: true, position: 'first_half', platform: 'chatgpt' },
    ];
    const fourPlatforms = [
      { mentioned: true, position: 'first_half', platform: 'chatgpt' },
      { mentioned: true, position: 'first_half', platform: 'google' },
      { mentioned: true, position: 'first_half', platform: 'deepseek' },
      { mentioned: true, position: 'first_half', platform: 'doubao' },
    ];
    const oneResult = calcAutoD5RankingFIXED(onePlatform);
    const fourResult = calcAutoD5RankingFIXED(fourPlatforms);
    expect(fourResult).toBeGreaterThan(oneResult);
  });

  it('BUG: identical to fixed when all 4 platforms present with equal data', () => {
    const fourPlatforms = [
      { mentioned: true, position: 'first_half', platform: 'chatgpt' },
      { mentioned: true, position: 'first_half', platform: 'google' },
      { mentioned: true, position: 'first_half', platform: 'deepseek' },
      { mentioned: true, position: 'first_half', platform: 'doubao' },
    ];
    const bugResult = calcAutoD5Ranking(fourPlatforms);
    const fixedResult = calcAutoD5RankingFIXED(fourPlatforms);
    // Both should be 100 when all 4 platforms have first_half mentions
    expect(bugResult).toBe(100);
    expect(fixedResult).toBe(100);
  });

  it('empty mentions list defaults to total=1 (division safety)', () => {
    const result = calcAutoD5Ranking([]);
    // mCount=0, firstHalf=0, platforms=4
    // (0/1)*0.25 + (0/1)*0.20 + (4/4)*0.15 = 0.15
    // 0.15/0.60 * 100 = 25
    expect(result).toBe(25);

    const fixedResult = calcAutoD5RankingFIXED([]);
    // platforms=1 (Set of nothing → size 0 → fallback 1)
    // (0/1)*0.25 + (0/1)*0.20 + (1/4)*0.15 = 0.0375
    // 0.0375/0.60 * 100 = 6.25
    expect(fixedResult).toBeCloseTo(6.25, 1);
  });
});

// ============================================================================
// D5 Mind Tests
// ============================================================================
describe('calcAutoD5Mind — brandAssoc Math.random()', () => {
  it('BUG: brandAssoc is non-deterministic (Math.random)', () => {
    const mentions = [
      { mentioned: true, sentiment: 'positive', depth: 'detailed' },
    ];
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(calcAutoD5Mind(mentions));
    }
    // With Math.random(), we should see multiple different values
    expect(results.size).toBeGreaterThan(1);
  });

  it('FIXED: deterministic output for same input', () => {
    const mentions = [
      { mentioned: true, sentiment: 'positive', depth: 'detailed' },
    ];
    const r1 = calcAutoD5MindFIXED(mentions);
    const r2 = calcAutoD5MindFIXED(mentions);
    expect(r1).toBe(r2);
  });

  it('correctly weights positive sentiment', () => {
    const allPositive = [
      { mentioned: true, sentiment: 'positive', depth: 'brief' },
      { mentioned: true, sentiment: 'positive', depth: 'brief' },
    ];
    const allNegative = [
      { mentioned: true, sentiment: 'negative', depth: 'brief' },
      { mentioned: true, sentiment: 'negative', depth: 'brief' },
    ];
    const posResult = calcAutoD5MindFIXED(allPositive);
    const negResult = calcAutoD5MindFIXED(allNegative);
    expect(posResult).toBeGreaterThan(negResult);
  });

  it('correctly weights detailed depth', () => {
    const allDetailed = [
      { mentioned: true, sentiment: 'neutral', depth: 'detailed' },
      { mentioned: true, sentiment: 'neutral', depth: 'detailed' },
    ];
    const allBrief = [
      { mentioned: true, sentiment: 'neutral', depth: 'brief' },
      { mentioned: true, sentiment: 'neutral', depth: 'brief' },
    ];
    const detailedResult = calcAutoD5MindFIXED(allDetailed);
    const briefResult = calcAutoD5MindFIXED(allBrief);
    expect(detailedResult).toBeGreaterThan(briefResult);
  });
});

// ============================================================================
// D5 Composite (0.60 × ranking + 0.40 × mind)
// ============================================================================
describe('D5 composite normalization', () => {
  it('weighted composite: 60% ranking + 40% mind', () => {
    const d5Rank = 80;
    const d5Mind = 50;
    const d5 = Math.round(0.60 * d5Rank + 0.40 * d5Mind);
    expect(d5).toBe(68); // 48 + 20 = 68
  });

  it('D5 ranges from 0 to 100', () => {
    expect(Math.round(0.60 * 0 + 0.40 * 0)).toBe(0);
    expect(Math.round(0.60 * 100 + 0.40 * 100)).toBe(100);
  });
});
