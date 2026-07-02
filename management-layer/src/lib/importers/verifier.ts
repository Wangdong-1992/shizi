/**
 * Stage 4: Verifier — AI Verification.
 *
 * Checks structured entries for:
 *   - Factual conflicts (contradictory information within/across entries)
 *   - Missing critical fields
 *   - Low-confidence entries that need manual review
 *
 * Primary path: AI verification.
 * Fallback path: Skip verification, flag all as manual_review_needed.
 */

import { OpenAIProvider } from '../ai-providers/openai.js';
import type { StructuredEntry } from './structurer.js';

const VERIFICATION_PROMPT = `检查以下知识条目是否存在事实冲突、相互矛盾或关键信息缺失。
如发现冲突标注 source1/source2/field/conflict。
返回 JSON：{"conflicts": [{"field": "字段名", "source1": "条目1标题", "source2": "条目2标题", "description": "冲突描述"}], "missingFields": ["缺失字段名"]}

只返回 JSON 对象，不要添加任何解释或 Markdown 代码块标记。`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictInfo {
  /** The field/attribute that conflicts */
  field: string;
  /** First conflicting source (entry title) */
  source1: string;
  /** Second conflicting source (entry title) */
  source2: string;
  /** Human-readable conflict description */
  description: string;
}

export interface VerifiedEntry {
  /** Original entry */
  entry: StructuredEntry;
  /** Conflicts found for this entry */
  conflicts: ConflictInfo[];
  /** Adjusted confidence after verification (AI may lower uncertain entries) */
  adjustedConfidence: number;
  /** Whether manual review is needed */
  needsManualReview: boolean;
}

export interface VerifierResult {
  /** Verified entries with conflict annotations */
  entries: VerifiedEntry[];
  /** Method used */
  method: 'ai' | 'skip';
  /** Global missing fields across all entries */
  globalMissingFields: string[];
}

// ---------------------------------------------------------------------------
// AI Verification
// ---------------------------------------------------------------------------

async function verifyWithAI(entries: StructuredEntry[]): Promise<{ conflicts: ConflictInfo[]; missingFields: string[] }> {
  const provider = new OpenAIProvider();

  // Build entry summary for the AI
  const entrySummary = entries
    .map((e, i) => `[条目${i + 1}] 标题: ${e.title}\n分类: ${e.category}\n内容: ${e.content.slice(0, 500)}`)
    .join('\n\n');

  const result = await provider.generateText(
    `${VERIFICATION_PROMPT}\n\n${entrySummary}`,
    { temperature: 0.1, maxTokens: 2048 },
  );

  let jsonStr = result.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      conflicts: parsed.conflicts ?? [],
      missingFields: parsed.missingFields ?? [],
    };
  } catch {
    return { conflicts: [], missingFields: [] };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Verify structured entries for conflicts and missing information.
 * Tries AI first, falls back to skip-and-flag mode.
 *
 * @param entries - Structured entries from the structurer stage
 * @returns Verified entries with conflict annotations
 */
export async function verify(entries: StructuredEntry[]): Promise<VerifierResult> {
  try {
    const { conflicts, missingFields } = await verifyWithAI(entries);

    // Map conflicts back to entries
    const verifiedEntries: VerifiedEntry[] = entries.map((entry) => {
      const entryConflicts = conflicts.filter(
        (c) => c.source1 === entry.title || c.source2 === entry.title,
      );

      // Lower confidence if conflicts found
      const adjustedConfidence = entryConflicts.length > 0
        ? Math.max(0.1, entry.confidence - 0.3)
        : entry.confidence;

      const needsManualReview = entryConflicts.length > 0
        || adjustedConfidence < 0.5
        || missingFields.length > 0;

      return {
        entry,
        conflicts: entryConflicts,
        adjustedConfidence,
        needsManualReview,
      };
    });

    return {
      entries: verifiedEntries,
      method: 'ai',
      globalMissingFields: missingFields,
    };
  } catch (err) {
    console.warn('[verifier] AI verification failed, skipping:', err);

    // Fallback: flag all for manual review
    const verifiedEntries: VerifiedEntry[] = entries.map((entry) => ({
      entry,
      conflicts: [],
      adjustedConfidence: entry.confidence,
      needsManualReview: true,
    }));

    return {
      entries: verifiedEntries,
      method: 'skip',
      globalMissingFields: [],
    };
  }
}
