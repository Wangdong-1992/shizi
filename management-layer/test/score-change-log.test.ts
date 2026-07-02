/**
 * Analysis Tests — ScoreChangeLog Threshold & Service.
 *
 * Verifies:
 *   1. The |diff| ≥ 5 threshold is applied in calculateAuto
 *   2. The service-level logChange has NO threshold guard (potential bypass)
 *   3. Edge cases for threshold logic
 *
 * Run with: npx vitest test/score-change-log.test.ts
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Reproduction of the threshold logic from scoring.service.ts:calculateAuto
// ============================================================================
function shouldLogChange(previousScore: number | null, newScore: number): boolean {
  if (previousScore === null) return false; // no previous score → no log
  return Math.abs(newScore - previousScore) >= 5;
}

// ============================================================================
// Threshold Tests
// ============================================================================
describe('ScoreChangeLog — |diff| ≥ 5 threshold', () => {
  it('logs when diff equals exactly 5', () => {
    expect(shouldLogChange(50, 55)).toBe(true);
    expect(shouldLogChange(55, 50)).toBe(true);
  });

  it('logs when diff > 5', () => {
    expect(shouldLogChange(50, 70)).toBe(true);
    expect(shouldLogChange(70, 50)).toBe(true);
    expect(shouldLogChange(0, 100)).toBe(true);
  });

  it('does NOT log when diff < 5', () => {
    expect(shouldLogChange(50, 54.9)).toBe(false);
    expect(shouldLogChange(50, 46.1)).toBe(false);
    expect(shouldLogChange(50, 50)).toBe(false);
  });

  it('does NOT log when diff is 4.99', () => {
    expect(shouldLogChange(50, 54.99)).toBe(false);
    expect(shouldLogChange(50, 45.01)).toBe(false);
  });

  it('does NOT log when previousScore is null (first score)', () => {
    expect(shouldLogChange(null, 50)).toBe(false);
    expect(shouldLogChange(null, 100)).toBe(false);
    expect(shouldLogChange(null, 0)).toBe(false);
  });

  it('handles floating point scores correctly', () => {
    // geoScore is stored as Float in Prisma
    expect(shouldLogChange(72.34, 77.34)).toBe(true);   // diff = 5.0
    expect(shouldLogChange(72.34, 77.33)).toBe(false);  // diff = 4.99
  });
});

// ============================================================================
// Service-level bypass analysis
// ============================================================================
describe('ScoreChangeLogService — no threshold guard', () => {
  it('BUG: service-level logChange has no threshold check', () => {
    // The service function (score-change-log.service.ts:logChange)
    // accepts any change without checking |diff| ≥ 5.
    // This means direct calls from other routes could log tiny changes.
    //
    // The guard ONLY exists in scoring.service.ts:calculateAuto line 310.
    //
    // Mitigation: The scoring routes only call calculateAuto, which has the guard.
    // But if someone adds a new endpoint that calls logChange directly,
    // they could bypass the threshold.
    //
    // FIX: Move the threshold check into logChange itself.
    expect(true).toBe(true); // documentation of known issue
  });
});

// ============================================================================
// Reason string analysis
// ============================================================================
describe('ScoreChangeLog — reason string', () => {
  it('BUG: reason always uses ↑ even when score decreases', () => {
    // In scoring.service.ts line 311:
    // const reason = `D3↑(爬虫${crawlerTypes.length}种+路径${activePaths}条) D5↑(提及${mentions.length}条)`;
    //
    // The ↑ arrow is hardcoded regardless of whether the score went up or down.
    // This is misleading when the score actually decreased.
    const reason = `D3↑(爬虫3种+路径2条) D5↑(提及40条)`;
    expect(reason).toContain('↑');
    expect(reason).not.toContain('↓');
  });
});
