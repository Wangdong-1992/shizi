/**
 * Unit Tests — GEO Scoring Formula v5.0 Pure Functions.
 *
 * These tests verify the mathematical correctness of the scoring cascade
 * using the pure functions in lib/scoring-formula.ts.
 *
 * Run with: npx vitest test/scoring-formula.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEeatComposite,
  calculateD5Ranking,
  calculateD5Mind,
  calculateGeoScore,
  validateFormula,
} from '../src/lib/scoring-formula.js';

// ============================================================================
// D2: E-E-A-T Composite
// ============================================================================
describe('calculateEeatComposite', () => {
  it('computes equal-weight average of 4 sub-dimensions', () => {
    const result = calculateEeatComposite({
      experience: 80,
      expertise: 60,
      authoritativeness: 40,
      trustworthiness: 100,
    });
    // 0.25×80 + 0.25×60 + 0.25×40 + 0.25×100 = 20+15+10+25 = 70
    expect(result).toBeCloseTo(70, 1);
  });

  it('returns 0 when all sub-dimensions are 0', () => {
    const result = calculateEeatComposite({
      experience: 0,
      expertise: 0,
      authoritativeness: 0,
      trustworthiness: 0,
    });
    expect(result).toBe(0);
  });

  it('returns 100 when all sub-dimensions are 100', () => {
    const result = calculateEeatComposite({
      experience: 100,
      expertise: 100,
      authoritativeness: 100,
      trustworthiness: 100,
    });
    expect(result).toBeCloseTo(100, 1);
  });

  it('handles asymmetric inputs correctly', () => {
    const result = calculateEeatComposite({
      experience: 100,
      expertise: 50,
      authoritativeness: 0,
      trustworthiness: 50,
    });
    expect(result).toBeCloseTo(50, 1);
  });
});

// ============================================================================
// D5: Ranking Axis
// ============================================================================
describe('calculateD5Ranking', () => {
  it('returns 0 when all inputs are 0', () => {
    const result = calculateD5Ranking({ mentions: 0, position: 50, coverage: 0 });
    expect(result).toBeCloseTo(0, 1);
  });

  it('returns high score for ideal inputs', () => {
    const result = calculateD5Ranking({ mentions: 50, position: 1, coverage: 4 });
    // mentionScore=100, positionScore=100, coverageScore=100
    // raw = 0.25×100 + 0.20×100 + 0.15×100 = 60 → 60/0.60 = 100
    expect(result).toBeCloseTo(100, 1);
  });

  it('returns mid-range score for average inputs', () => {
    const result = calculateD5Ranking({ mentions: 25, position: 10, coverage: 2 });
    // mentionScore = (25/50)*100 = 50
    // positionScore = 100 - (10-1)*2 = 82
    // coverageScore = (2/4)*100 = 50
    // raw = 0.25×50 + 0.20×82 + 0.15×50 = 12.5 + 16.4 + 7.5 = 36.4
    // 36.4/0.60 = 60.67
    expect(result).toBeCloseTo(60.67, 1);
  });

  it('capped at 100 for overflow inputs', () => {
    const result = calculateD5Ranking({ mentions: 100, position: 1, coverage: 10 });
    expect(result).toBe(100);
  });

  it('worst position (50) gives 0 position score', () => {
    const result = calculateD5Ranking({ mentions: 0, position: 50, coverage: 0 });
    // mentionScore=0, positionScore=0, coverageScore=0 → 0/0.60 = 0
    expect(result).toBe(0);
  });
});

// ============================================================================
// D5: Mindshare Axis
// ============================================================================
describe('calculateD5Mind', () => {
  it('returns 0 when all inputs are 0', () => {
    const result = calculateD5Mind({ sentiment: 0, depth: 0, brandAssoc: 0 });
    expect(result).toBe(0);
  });

  it('returns 100 for perfect inputs', () => {
    const result = calculateD5Mind({ sentiment: 100, depth: 100, brandAssoc: 100 });
    // raw = 0.15×100 + 0.15×100 + 0.10×100 = 40 → 40/0.40 = 100
    expect(result).toBeCloseTo(100, 1);
  });

  it('returns mid-range for average inputs', () => {
    const result = calculateD5Mind({ sentiment: 60, depth: 50, brandAssoc: 70 });
    // raw = 0.15×60 + 0.15×50 + 0.10×70 = 9+7.5+7 = 23.5
    // 23.5/0.40 = 58.75
    expect(result).toBeCloseTo(58.75, 1);
  });

  it('is capped at 100', () => {
    const result = calculateD5Mind({ sentiment: 200, depth: 200, brandAssoc: 200 });
    expect(result).toBe(100);
  });
});

// ============================================================================
// Full Cascading Score
// ============================================================================
describe('calculateGeoScore', () => {
  it('returns correct cascade for ideal inputs (no competition)', () => {
    const result = calculateGeoScore({ d1: 100, d2: 100, d3: 100, d4: 0, d5: 100 });
    expect(result.production).toBeCloseTo(100, 1);   // √(100×100)
    expect(result.reach).toBeCloseTo(100, 1);         // 100×(0.30+0.70)
    expect(result.effective).toBeCloseTo(100, 1);     // 100×(1-0)
    expect(result.geoScore).toBeCloseTo(100, 1);      // 0.50×100+0.50×100
  });

  it('returns low score for worst inputs', () => {
    const result = calculateGeoScore({ d1: 10, d2: 10, d3: 10, d4: 100, d5: 0 });
    expect(result.production).toBeCloseTo(10, 1);     // √(10×10)
    expect(result.reach).toBeCloseTo(3.7, 1);         // 10×(0.30+0.70×0.10)
    expect(result.effective).toBeCloseTo(1.11, 1);    // 3.7×(1-0.70)
    expect(result.geoScore).toBeCloseTo(0.555, 1);    // 0.50×1.11+0
  });

  it('D5=0 cap: max GEO ≤ 50 (theoretical maximum)', () => {
    const result = calculateGeoScore({ d1: 100, d2: 100, d3: 100, d4: 0, d5: 0 });
    expect(result.geoScore).toBeLessThanOrEqual(50);
    expect(result.geoScore).toBeCloseTo(50, 1);
  });

  it('moderate competition reduces effective but preserves GEO', () => {
    const result = calculateGeoScore({ d1: 60, d2: 50, d3: 40, d4: 50, d5: 60 });
    expect(result.production).toBeCloseTo(54.77, 1);   // √(60×50)
    expect(result.effective).toBeLessThan(result.reach); // competition trims reach
    expect(result.geoScore).toBeGreaterThan(0);
  });

  it('d2Breakdown is always zero-filled (known issue)', () => {
    const result = calculateGeoScore({ d1: 80, d2: 70, d3: 60, d4: 30, d5: 50 });
    // BUG: d2Breakdown should reflect actual values but is always zero
    expect(result.d2Breakdown.experience).toBe(0);
    expect(result.d2Breakdown.expertise).toBe(0);
    expect(result.d2Breakdown.authoritativeness).toBe(0);
    expect(result.d2Breakdown.trustworthiness).toBe(0);
  });

  it('d5Ranking and d5Mind are always zero-filled (known issue)', () => {
    const result = calculateGeoScore({ d1: 80, d2: 70, d3: 60, d4: 30, d5: 50 });
    expect(result.d5Ranking).toBe(0);
    expect(result.d5Mind).toBe(0);
  });
});

// ============================================================================
// Formula Validation
// ============================================================================
describe('validateFormula', () => {
  it('confirms D5=0 max GEO ≤ 50', () => {
    const result = validateFormula();
    expect(result.valid).toBe(true);
    expect(result.maxScoreAtD5Zero).toBeLessThanOrEqual(50);
  });
});
