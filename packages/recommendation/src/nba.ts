// Next Best Action engine (spec §12).
//
//   priority = target_relevance
//            × skill_gap
//            × learning_value
//            × exam_relevance
//            × confidence_factor
//            × recency_factor
//            × prerequisite_readiness
//
// Every factor is in [0,1]; a mastered skill (gap 0) or an off-target skill
// (target_relevance 0) collapses to priority 0. Each recommendation carries
// machine-readable reason codes. Pure and deterministic.

export interface SkillSnapshot {
  skillId: string;
  masteryProbability: number;
  confidence: number;
  evidenceCount: number;
}

export type ReasonCode =
  | 'LOW_MASTERY'
  | 'DEVELOPING_MASTERY'
  | 'HIGH_LEARNING_VALUE'
  | 'LOW_CONFIDENCE'
  | 'HIGH_TARGET_RELEVANCE'
  | 'HIGH_EXAM_RELEVANCE'
  | 'PREREQUISITES_WEAK'
  | 'RECENTLY_PRACTICED'
  | 'NEEDS_EVIDENCE';

export interface NbaInputs {
  /** Target relevance in [0,1] (spec §12); default 1. */
  targetRelevance?: (skillId: string) => number;
  /** Exam-blueprint relevance in [0,1]; default 1. */
  examRelevance?: (skillId: string) => number;
  /** How many times the skill was practised recently (dampens repeats). */
  recentCounts?: Map<string, number>;
  /** Prerequisite readiness in [0,1]; default 1 (no gating). */
  prerequisiteReadiness?: (skillId: string) => number;
  /** Desired mastery target; default 0.85. */
  desiredMastery?: number;
}

export interface NbaFactors {
  targetRelevance: number;
  skillGap: number;
  learningValue: number;
  examRelevance: number;
  confidenceFactor: number;
  recencyFactor: number;
  prerequisiteReadiness: number;
}

export interface NbaItem {
  skillId: string;
  priority: number;
  factors: NbaFactors;
  reasonCodes: ReasonCode[];
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function computeFactors(skill: SkillSnapshot, inputs: NbaInputs = {}): NbaFactors {
  const desired = inputs.desiredMastery ?? 0.85;
  const p = skill.masteryProbability;

  // How far below the desired mastery (0 when already there).
  const skillGap = clamp01((desired - p) / desired);
  // Steepest learning near mid-mastery; low at the extremes (too easy / may
  // lack prerequisites). Independent of evidence (that's confidence's job).
  const learningValue = clamp01(4 * p * (1 - p));
  // Gentle preference for skills we have some evidence on, without silencing
  // uncertainty reduction (floor at 0.6).
  const confidenceFactor = 0.6 + 0.4 * clamp01(skill.confidence);
  const recentCount = inputs.recentCounts?.get(skill.skillId) ?? 0;
  const recencyFactor = 1 / (1 + recentCount);

  const targetRelevance = clamp01(inputs.targetRelevance?.(skill.skillId) ?? 1);
  const examRelevance = clamp01(inputs.examRelevance?.(skill.skillId) ?? 1);
  const prerequisiteReadiness = clamp01(inputs.prerequisiteReadiness?.(skill.skillId) ?? 1);

  return {
    targetRelevance,
    skillGap,
    learningValue,
    examRelevance,
    confidenceFactor,
    recencyFactor,
    prerequisiteReadiness,
  };
}

function reasonCodes(skill: SkillSnapshot, f: NbaFactors, inputs: NbaInputs): ReasonCode[] {
  const codes: ReasonCode[] = [];
  if (f.skillGap >= 0.5) codes.push('LOW_MASTERY');
  else if (f.skillGap >= 0.2) codes.push('DEVELOPING_MASTERY');
  if (f.learningValue >= 0.75) codes.push('HIGH_LEARNING_VALUE');
  if (skill.confidence < 0.3) codes.push(skill.evidenceCount === 0 ? 'NEEDS_EVIDENCE' : 'LOW_CONFIDENCE');
  // Only claim target/exam relevance when a provider actually differentiates.
  if (inputs.targetRelevance && f.targetRelevance >= 0.99) codes.push('HIGH_TARGET_RELEVANCE');
  if (inputs.examRelevance && f.examRelevance >= 0.99) codes.push('HIGH_EXAM_RELEVANCE');
  if (f.prerequisiteReadiness < 1) codes.push('PREREQUISITES_WEAK');
  if (f.recencyFactor < 1) codes.push('RECENTLY_PRACTICED');
  return codes;
}

function priorityOf(f: NbaFactors): number {
  return (
    f.targetRelevance *
    f.skillGap *
    f.learningValue *
    f.examRelevance *
    f.confidenceFactor *
    f.recencyFactor *
    f.prerequisiteReadiness
  );
}

/**
 * Rank skills by Next Best Action priority (highest first). Skills at/above the
 * desired mastery collapse to 0 and sort last. Ties break by skillId for
 * determinism.
 */
export function nextBestActions(skills: SkillSnapshot[], inputs: NbaInputs = {}): NbaItem[] {
  return skills
    .map((skill) => {
      const factors = computeFactors(skill, inputs);
      return {
        skillId: skill.skillId,
        priority: priorityOf(factors),
        factors,
        reasonCodes: reasonCodes(skill, factors, inputs),
      };
    })
    .sort((a, b) => (b.priority - a.priority) || a.skillId.localeCompare(b.skillId));
}

/**
 * Prerequisite readiness helper: the minimum mastery among a skill's
 * prerequisites, divided by a readiness target (default 0.6) and clamped to
 * [0,1]. A skill with no prerequisites is fully ready.
 */
export function prerequisiteReadinessFrom(
  states: Map<string, SkillSnapshot>,
  prerequisitesOf: (skillId: string) => string[],
  readyAt = 0.6,
): (skillId: string) => number {
  return (skillId: string): number => {
    const prereqs = prerequisitesOf(skillId);
    if (prereqs.length === 0) return 1;
    let min = 1;
    for (const p of prereqs) {
      const m = states.get(p)?.masteryProbability ?? 0.5;
      min = Math.min(min, m);
    }
    return clamp01(min / readyAt);
  };
}
