// A minimal, explainable recommendation derived from the diagnostic result.
// The full Next Best Action priority model (target relevance, exam relevance,
// recency, etc.) arrives in Week 6; here we produce a single honest next action
// from the biggest gap, with machine-readable reason codes (spec §12).

import type { SkillProfileItem } from './profile';

export type ReasonCode =
  | 'LOW_MASTERY'
  | 'DEVELOPING_MASTERY'
  | 'HIGH_TARGET_RELEVANCE'
  | 'HIGH_EXAM_RELEVANCE'
  | 'LOW_CONFIDENCE'
  | 'NO_EVIDENCE_YET';

export interface Recommendation {
  skillId: string;
  reasonCodes: ReasonCode[];
  /** Human-readable rationale (spec principle: explain recommendations). */
  explanation: string;
}

/**
 * Recommend the single highest-value next skill from the diagnostic gaps.
 * Returns null when there are no actionable gaps (e.g. everything mastered or
 * nothing assessed yet).
 */
export function recommendFromGaps(gaps: SkillProfileItem[]): Recommendation | null {
  if (gaps.length === 0) return null;

  // Gaps are pre-sorted lowest-mastery first by topGaps().
  const target = gaps[0];
  const reasonCodes: ReasonCode[] = [];

  if (target.band === 'weak') reasonCodes.push('LOW_MASTERY');
  else if (target.band === 'developing') reasonCodes.push('DEVELOPING_MASTERY');

  if (target.confidence < 0.5) reasonCodes.push('LOW_CONFIDENCE');

  const explanation =
    target.band === 'weak'
      ? `This is currently your weakest assessed area. Focusing here is likely to yield the largest improvement.`
      : `This area is developing. A focused session here can push it toward mastery.`;

  return { skillId: target.skillId, reasonCodes, explanation };
}
