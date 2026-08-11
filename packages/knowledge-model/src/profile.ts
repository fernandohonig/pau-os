// Aggregates per-skill mastery states into a student-facing profile: overall
// level estimate (with an uncertainty range — never a fake-precise number,
// spec §13), gaps, and strengths.

import { masteryBand, type MasteryState, type MasteryBand } from '@pau/scoring';

export interface SkillStateEntry {
  skillId: string;
  state: MasteryState;
}

export interface SkillProfileItem {
  skillId: string;
  band: MasteryBand;
  /** In [0,1]; internal — API layer decides how much to surface. */
  masteryProbability: number;
  confidence: number;
  evidenceCount: number;
}

export interface LevelEstimate {
  /** Point estimate on a 0–10 scale. */
  level: number;
  /** Lower/upper bound of the estimate; widens when confidence is low. */
  range: [number, number];
  /** Average confidence across assessed skills, in [0,1]. */
  confidence: number;
  /** How many skills contributed evidence to this estimate. */
  assessedSkillCount: number;
}

export interface ProfileConfig {
  minEvidence: number;
  /** Max width (in level points) of the range at zero confidence. */
  maxMargin: number;
}

export const DEFAULT_PROFILE_CONFIG: ProfileConfig = {
  minEvidence: 2,
  maxMargin: 2,
};

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Build the per-skill profile items (one per known skill state). */
export function buildSkillProfile(
  entries: SkillStateEntry[],
  config: ProfileConfig = DEFAULT_PROFILE_CONFIG,
): SkillProfileItem[] {
  return entries.map(({ skillId, state }) => ({
    skillId,
    band: masteryBand(state, config.minEvidence),
    masteryProbability: state.masteryProbability,
    confidence: state.confidence,
    evidenceCount: state.evidenceCount,
  }));
}

/**
 * Estimate an overall 0–10 subject level from assessed skills. Only skills with
 * evidence contribute. The returned range widens as average confidence drops,
 * so a thin diagnostic yields a wide (honest) range rather than false precision.
 */
export function estimateLevel(
  entries: SkillStateEntry[],
  config: ProfileConfig = DEFAULT_PROFILE_CONFIG,
): LevelEstimate {
  const assessed = entries.filter((e) => e.state.evidenceCount > 0);

  if (assessed.length === 0) {
    return { level: 0, range: [0, 0], confidence: 0, assessedSkillCount: 0 };
  }

  const meanMastery =
    assessed.reduce((sum, e) => sum + e.state.masteryProbability, 0) / assessed.length;
  const meanConfidence =
    assessed.reduce((sum, e) => sum + e.state.confidence, 0) / assessed.length;

  const level = round1(meanMastery * 10);
  const margin = round1((1 - meanConfidence) * config.maxMargin);
  const range: [number, number] = [
    round1(Math.max(0, level - margin)),
    round1(Math.min(10, level + margin)),
  ];

  return { level, range, confidence: round1(meanConfidence), assessedSkillCount: assessed.length };
}

/**
 * Top-N gaps: assessed skills that are not yet mastered, ordered by lowest
 * mastery first (biggest opportunity). Unassessed skills are excluded here —
 * they are handled by coverage in the diagnostic, not the results screen.
 */
export function topGaps(
  entries: SkillStateEntry[],
  n = 3,
  config: ProfileConfig = DEFAULT_PROFILE_CONFIG,
): SkillProfileItem[] {
  return buildSkillProfile(entries, config)
    .filter((item) => item.band !== 'insufficient_evidence' && item.band !== 'mastered')
    .sort((a, b) => a.masteryProbability - b.masteryProbability)
    .slice(0, n);
}

/** Top-N strengths: assessed, mastered skills ordered by highest mastery. */
export function topStrengths(
  entries: SkillStateEntry[],
  n = 3,
  config: ProfileConfig = DEFAULT_PROFILE_CONFIG,
): SkillProfileItem[] {
  return buildSkillProfile(entries, config)
    .filter((item) => item.band === 'mastered')
    .sort((a, b) => b.masteryProbability - a.masteryProbability)
    .slice(0, n);
}
