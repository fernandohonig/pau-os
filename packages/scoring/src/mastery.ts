// Transparent probabilistic mastery model (spec §10).
//
// We track a per-skill mastery probability p ∈ (0,1) and update it with each
// piece of evidence using a logistic (log-odds) update. This is deliberately
// simple and auditable — no black-box ML in v0.1.
//
// Requirements satisfied (spec §10):
//  - correct answers increase mastery, incorrect answers decrease it
//  - a *hard* question answered correctly is stronger positive evidence;
//    an *easy* question answered incorrectly is stronger negative evidence
//  - repeated answers to the same skill carry diminishing information
//  - "I don't know" is negative evidence, but weaker than a wrong answer and
//    independent of difficulty (it signals absence of knowledge, not a slip)
//
// Raw probabilities are internal; see `masteryBand` for the user-facing view.

export type Outcome = 'correct' | 'incorrect' | 'idk';

export interface MasteryState {
  /** Probability the student has mastered the skill, in (0,1). */
  masteryProbability: number;
  /** Confidence in the estimate, in [0,1), driven by evidence volume. */
  confidence: number;
  /** Number of evidence items observed for this skill. */
  evidenceCount: number;
}

export interface UpdateConfig {
  /** Global multiplier on the log-odds step. */
  scale: number;
  /** Diminishing-returns rate for repeated evidence on the same skill. */
  repetitionDecay: number;
  /** Symmetric clamp on the log-odds to keep p away from 0 and 1. */
  logitClamp: number;
  /** Pseudo-count controlling how fast confidence grows with evidence. */
  confidencePseudocount: number;
  /** Magnitude of the (difficulty-independent) penalty for "I don't know". */
  idkPenalty: number;
}

export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  scale: 1.0,
  repetitionDecay: 0.2,
  logitClamp: 6,
  confidencePseudocount: 3,
  idkPenalty: 0.75,
};

/** Prior state for a skill with no evidence: 0.50 mastery (spec §10). */
export const INITIAL_MASTERY: MasteryState = {
  masteryProbability: 0.5,
  confidence: 0,
  evidenceCount: 0,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function logit(p: number): number {
  // Guard against ±Infinity for p at the boundaries.
  const eps = 1e-6;
  const clamped = Math.min(1 - eps, Math.max(eps, p));
  return Math.log(clamped / (1 - clamped));
}

function clamp(x: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, x));
}

/**
 * The raw (pre-decay) log-odds step contributed by a single answer, before the
 * global scale and repetition decay are applied. Exposed for testing/tuning.
 *
 * @param difficulty question difficulty in [0,1]
 */
export function evidenceStep(outcome: Outcome, difficulty: number, config: UpdateConfig): number {
  const d = Math.min(1, Math.max(0, difficulty));
  switch (outcome) {
    case 'correct':
      // Harder correct answers are more informative: 0.5 (easy) → 1.5 (hard).
      return 0.5 + d;
    case 'incorrect':
      // Easier wrong answers are more informative: 1.5 (easy) → 0.5 (hard).
      return -(1.5 - d);
    case 'idk':
      // Difficulty-independent, weaker than a wrong answer.
      return -config.idkPenalty;
  }
}

/**
 * Apply one piece of evidence to a skill's mastery state.
 */
export function updateMastery(
  prev: MasteryState,
  outcome: Outcome,
  difficulty: number,
  config: UpdateConfig = DEFAULT_UPDATE_CONFIG,
): MasteryState {
  const base = evidenceStep(outcome, difficulty, config);
  const decay = 1 / (1 + config.repetitionDecay * prev.evidenceCount);
  const delta = config.scale * base * decay;

  const nextLogit = clamp(logit(prev.masteryProbability) + delta, config.logitClamp);
  const masteryProbability = sigmoid(nextLogit);
  const evidenceCount = prev.evidenceCount + 1;
  const confidence = evidenceCount / (evidenceCount + config.confidencePseudocount);

  return { masteryProbability, confidence, evidenceCount };
}

export type MasteryBand = 'insufficient_evidence' | 'weak' | 'developing' | 'mastered';

/**
 * User-facing categorisation of a skill (spec §8: mastered / developing / weak
 * / insufficient evidence). Raw probability is never exposed directly.
 */
export function masteryBand(state: MasteryState, minEvidence = 2): MasteryBand {
  if (state.evidenceCount < minEvidence) return 'insufficient_evidence';
  if (state.masteryProbability >= 0.75) return 'mastered';
  if (state.masteryProbability >= 0.5) return 'developing';
  return 'weak';
}
