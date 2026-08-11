// Adaptive diagnostic algorithm (spec §11).
//
// The diagnostic maximizes information rather than running a random quiz. After
// each answer the caller updates skill state (via @pau/scoring) and asks the
// engine for the next question. Selection balances:
//   - skill coverage (sample skills not yet seen)
//   - uncertainty (prefer skills whose mastery is unknown / near 0.5)
//   - difficulty match (most informative near the current ability estimate;
//     with no evidence this defaults to medium difficulty — spec §11 step 2)
//   - repetition avoidance (don't over-sample one skill)
//   - target relevance (hook; uniform until the goal engine lands in Week 5)
//
// All functions are pure and deterministic given their inputs, so the whole
// flow is unit-testable without a database.

import { INITIAL_MASTERY, type MasteryState } from '@pau/scoring';

export interface QuestionMeta {
  id: string;
  skills: string[];
  /** Difficulty in [0,1]. */
  difficulty: number;
}

export interface SelectionWeights {
  coverage: number;
  uncertainty: number;
  difficulty: number;
  repetition: number;
  target: number;
}

export interface DiagnosticConfig {
  minQuestions: number;
  maxQuestions: number;
  /** Distinct skills that must have evidence before a confident stop. */
  minSkillCoverage: number;
  /** Average uncertainty (over assessed skills) at/under which we may stop. */
  uncertaintyThreshold: number;
  weights: SelectionWeights;
}

export const DEFAULT_DIAGNOSTIC_CONFIG: DiagnosticConfig = {
  minQuestions: 8,
  maxQuestions: 20,
  minSkillCoverage: 6,
  uncertaintyThreshold: 0.4,
  weights: {
    coverage: 1.5,
    uncertainty: 1.0,
    difficulty: 0.6,
    repetition: 0.5,
    target: 0.8,
  },
};

export type StopReason = 'max_questions' | 'exhausted' | 'confident' | null;

/** Optional per-skill target relevance in [0,1] (Week 5 goal engine fills this). */
export type TargetRelevance = (skillId: string) => number;

function getState(skillStates: Map<string, MasteryState>, skillId: string): MasteryState {
  return skillStates.get(skillId) ?? INITIAL_MASTERY;
}

/** Uncertainty about a single skill: high near p=0.5 and when confidence is low. */
export function skillUncertainty(state: MasteryState): number {
  const nearHalf = 1 - 2 * Math.abs(state.masteryProbability - 0.5); // 1 at 0.5, 0 at 0/1
  const lowConfidence = 1 - state.confidence;
  return 0.5 * nearHalf + 0.5 * lowConfidence;
}

/** Count, per skill, how many already-asked questions touched that skill. */
function askedSkillCounts(
  questions: QuestionMeta[],
  askedQuestionIds: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    if (!askedQuestionIds.has(q.id)) continue;
    for (const skill of q.skills) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return counts;
}

/** Score a candidate question; higher is a better next pick. */
export function scoreQuestion(
  q: QuestionMeta,
  skillStates: Map<string, MasteryState>,
  askedCounts: Map<string, number>,
  config: DiagnosticConfig,
  targetRelevance?: TargetRelevance,
): number {
  const { weights } = config;

  const states = q.skills.map((s) => getState(skillStates, s));

  const coverage = states.some((s) => s.evidenceCount === 0) ? 1 : 0;
  const uncertainty = Math.max(...states.map(skillUncertainty));
  const difficultyMatch =
    states.reduce((sum, s) => sum + (1 - Math.abs(q.difficulty - s.masteryProbability)), 0) /
    states.length;
  const repetition = q.skills.reduce((sum, s) => sum + (askedCounts.get(s) ?? 0), 0);
  const target = targetRelevance
    ? q.skills.reduce((max, s) => Math.max(max, targetRelevance(s)), 0)
    : 0;

  return (
    weights.coverage * coverage +
    weights.uncertainty * uncertainty +
    weights.difficulty * difficultyMatch -
    weights.repetition * repetition +
    weights.target * target
  );
}

/**
 * Choose the next question, or null if none remain. Deterministic: ties break
 * by highest score then lexicographically smallest question id.
 */
export function selectNextQuestion(
  questions: QuestionMeta[],
  skillStates: Map<string, MasteryState>,
  askedQuestionIds: Set<string>,
  config: DiagnosticConfig = DEFAULT_DIAGNOSTIC_CONFIG,
  targetRelevance?: TargetRelevance,
): string | null {
  const candidates = questions.filter((q) => !askedQuestionIds.has(q.id));
  if (candidates.length === 0) return null;

  const askedCounts = askedSkillCounts(questions, askedQuestionIds);

  let best: QuestionMeta | null = null;
  let bestScore = -Infinity;
  for (const q of candidates) {
    const score = scoreQuestion(q, skillStates, askedCounts, config, targetRelevance);
    if (score > bestScore || (score === bestScore && best !== null && q.id < best.id)) {
      bestScore = score;
      best = q;
    }
  }
  return best ? best.id : null;
}

/** Distinct skills that have at least one piece of evidence. */
export function coveredSkillCount(skillStates: Map<string, MasteryState>): number {
  let count = 0;
  for (const state of skillStates.values()) {
    if (state.evidenceCount > 0) count++;
  }
  return count;
}

/** Average uncertainty across assessed skills; 1 (max) when none assessed. */
export function averageUncertainty(skillStates: Map<string, MasteryState>): number {
  const assessed = [...skillStates.values()].filter((s) => s.evidenceCount > 0);
  if (assessed.length === 0) return 1;
  return assessed.reduce((sum, s) => sum + skillUncertainty(s), 0) / assessed.length;
}

/**
 * Decide whether the diagnostic should stop, and why. Stops on: reaching the
 * max question count, running out of candidates, or (past the minimum count)
 * achieving both skill coverage and low enough average uncertainty.
 */
export function evaluateStop(
  questions: QuestionMeta[],
  skillStates: Map<string, MasteryState>,
  askedQuestionIds: Set<string>,
  config: DiagnosticConfig = DEFAULT_DIAGNOSTIC_CONFIG,
): StopReason {
  const asked = askedQuestionIds.size;

  if (asked >= config.maxQuestions) return 'max_questions';
  if (questions.every((q) => askedQuestionIds.has(q.id))) return 'exhausted';

  if (
    asked >= config.minQuestions &&
    coveredSkillCount(skillStates) >= config.minSkillCoverage &&
    averageUncertainty(skillStates) <= config.uncertaintyThreshold
  ) {
    return 'confident';
  }

  return null;
}
