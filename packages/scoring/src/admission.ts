// Goal / admission scoring (spec §4, §9, §13).
//
// The Catalan admission score reaches 14: a general phase (0–10) plus a
// specific phase (0–4) built from up to two weighted subjects, each
// subject_mark (0–10) × coefficient (typically 0.1 or 0.2, so ≤2 points each).
//
// In the MVP we only estimate the student's Matemàtiques II *subject level*.
// We therefore compute ONLY that subject's specific-phase contribution and are
// explicit that the full admission score cannot be predicted yet (no grades, no
// second subject). We never treat a cutoff as a required score.

export interface Weighting {
  subject: string;
  coefficient: number;
}

/** Minimal level-estimate shape (mirrors knowledge-model's LevelEstimate). */
export interface LevelRange {
  level: number; // 0–10
  range: [number, number];
}

export interface SubjectContribution {
  subject: string;
  coefficient: number;
  /** Specific-phase points from this subject at the point estimate (0..10*coef). */
  points: number;
  /** Points range mirroring the level range. */
  range: [number, number];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Specific-phase points a subject contributes: mark (0–10) × coefficient. */
export function subjectContribution(subjectLevel: number, coefficient: number): number {
  const mark = Math.min(10, Math.max(0, subjectLevel));
  return round2(mark * coefficient);
}

/**
 * Estimate the target subject's specific-phase contribution from the diagnostic
 * level estimate and the degree's weighting for that subject. Returns null if
 * the degree does not weight the subject.
 */
export function estimateSubjectContribution(
  levelEstimate: LevelRange,
  weightings: Weighting[],
  subject: string,
): SubjectContribution | null {
  const w = weightings.find((x) => x.subject === subject);
  if (!w) return null;
  return {
    subject,
    coefficient: w.coefficient,
    points: subjectContribution(levelEstimate.level, w.coefficient),
    range: [
      subjectContribution(levelEstimate.range[0], w.coefficient),
      subjectContribution(levelEstimate.range[1], w.coefficient),
    ],
  };
}

/**
 * Build a target-relevance function for the diagnostic/recommendation engine
 * (spec §12). A skill's relevance is the coefficient of its subject under the
 * target degree, normalized to [0,1] against the degree's largest coefficient.
 * Skills whose subject is not weighted by the target get 0.
 *
 * In the single-subject MVP this is uniform across skills, but the plumbing is
 * correct for multi-subject targets later.
 */
export function buildTargetRelevance(
  weightings: Weighting[],
  subjectOf: (skillId: string) => string | undefined,
): (skillId: string) => number {
  const maxCoef = weightings.reduce((m, w) => Math.max(m, w.coefficient), 0);
  const bySubject = new Map(weightings.map((w) => [w.subject, w.coefficient]));

  return (skillId: string): number => {
    if (maxCoef <= 0) return 0;
    const subject = subjectOf(skillId);
    if (!subject) return 0;
    const coef = bySubject.get(subject);
    return coef ? coef / maxCoef : 0;
  };
}
