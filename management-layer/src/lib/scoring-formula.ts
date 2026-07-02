/**
 * GEO Scoring Formula v5.0 — Pure Functions.
 *
 * Cascade:
 *   Step 1: Production = √(D1 × D2)
 *           D2 = 0.25×Experience + 0.25×Expertise + 0.25×Authoritativeness + 0.25×Trustworthiness
 *   Step 2: Reach = Production × (0.30 + 0.70 × D3/100)
 *   Step 3: Effective = Reach × (1 − 0.70 × D4/100)
 *   Step 4: GEO = 0.50 × Effective + 0.50 × D5
 *           D5 = 0.60 × 排名轴 + 0.40 × 心智轴
 */

/** Input parameters for the scoring formula. */
export interface GeoScoreParams {
  /** D1: Intent coverage (0-100) */
  d1: number;
  /** D2: E-E-A-T composite (0-100) */
  d2: number;
  /** D3: Distribution reach (0-100) */
  d3: number;
  /** D4: Competition suppression (0-100, higher = more competition) */
  d4: number;
  /** D5: Impact (0-100) */
  d5: number;
}

/** E-E-A-T sub-dimension inputs. */
export interface EeatParams {
  experience: number;
  expertise: number;
  authoritativeness: number;
  trustworthiness: number;
}

/** D5 ranking axis inputs. */
export interface RankingAxisParams {
  mentions: number;
  position: number;
  coverage: number;
}

/** D5 mindshare axis inputs. */
export interface MindAxisParams {
  sentiment: number;
  depth: number;
  brandAssoc: number;
}

/** Complete scoring result with intermediate values. */
export interface ScoringResult {
  d1: number;
  d2: number;
  d2Breakdown: EeatParams;
  d3: number;
  d4: number;
  d5: number;
  d5Ranking: number;
  d5Mind: number;
  production: number;
  reach: number;
  effective: number;
  geoScore: number;
}

/**
 * Calculate the D2 E-E-A-T composite (equal weight).
 */
export function calculateEeatComposite(params: EeatParams): number {
  return (
    0.25 * params.experience +
    0.25 * params.expertise +
    0.25 * params.authoritativeness +
    0.25 * params.trustworthiness
  );
}

/**
 * Calculate D5 ranking axis score.
 * 排名轴 = 0.25×引用频次 + 0.20×引用位置 + 0.15×平台覆盖
 * Weights sum to 0.60, so normalize by dividing by 0.60 to get 0-100 scale.
 */
export function calculateD5Ranking(params: RankingAxisParams): number {
  // Normalize mentions (0-50 mentions → 0-100)
  const mentionScore = Math.min(100, (params.mentions / 50) * 100);
  // Normalize position (1=best → 100, 50=worst → 0)
  const positionScore = Math.max(0, 100 - (params.position - 1) * 2);
  // Normalize coverage (0-4 platforms → 0-100)
  const coverageScore = Math.min(100, (params.coverage / 4) * 100);

  const raw = 0.25 * mentionScore + 0.20 * positionScore + 0.15 * coverageScore;
  // Normalize: sub-weights sum to 0.60, divide to get 0-100
  return Math.min(100, raw / 0.60);
}

/**
 * Calculate D5 mindshare axis score.
 * 心智轴 = 0.15×情感倾向 + 0.15×认知深度 + 0.10×品牌关联
 * Weights sum to 0.40, so normalize by dividing by 0.40 to get 0-100 scale.
 */
export function calculateD5Mind(params: MindAxisParams): number {
  const raw = 0.15 * params.sentiment + 0.15 * params.depth + 0.10 * params.brandAssoc;
  // Normalize: sub-weights sum to 0.40, divide to get 0-100
  return Math.min(100, raw / 0.40);
}

/**
 * Calculate the full five-dimension GEO score.
 *
 * @param params - D1-D5 input scores
 * @returns Complete scoring result with intermediate cascade values
 */
export function calculateGeoScore(params: GeoScoreParams): ScoringResult {
  const production = Math.sqrt(params.d1 * params.d2);
  const reach = production * (0.30 + 0.70 * params.d3 / 100);
  const effective = reach * (1 - 0.70 * params.d4 / 100);
  const geoScore = 0.50 * effective + 0.50 * params.d5;

  return {
    d1: params.d1,
    d2: params.d2,
    // Phase 2 MVP; real values computed in scoring.service.ts
    d2Breakdown: { experience: 0, expertise: 0, authoritativeness: 0, trustworthiness: 0 },
    d3: params.d3,
    d4: params.d4,
    d5: params.d5,
    // Phase 2 MVP; real values computed in scoring.service.ts
    d5Ranking: 0,
    d5Mind: 0,
    production,
    reach,
    effective,
    geoScore,
  };
}

/**
 * Verify that D5=0 results in GEO ≤ 50 (validation constraint).
 * With D5=0 and max D1-D4 (100,100,100,0):
 *   production = √(100×100) = 100
 *   reach = 100 × (0.30+0.70) = 100
 *   effective = 100 × (1-0) = 100
 *   GEO = 0.50×100 + 0.50×0 = 50 ✓
 */
export function validateFormula(): { valid: boolean; maxScoreAtD5Zero: number } {
  const maxAtD5Zero = calculateGeoScore({ d1: 100, d2: 100, d3: 100, d4: 0, d5: 0 });
  return {
    valid: maxAtD5Zero.geoScore <= 50,
    maxScoreAtD5Zero: maxAtD5Zero.geoScore,
  };
}
