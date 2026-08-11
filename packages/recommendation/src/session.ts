// Practice session composition (spec §14).
//
// A ~15-minute session mixes item types rather than drilling one skill:
//   retrieval (recently weak) · confidence-builder (easier) · challenge (harder)
//   · spaced repetition (a seen skill) · exam-style item.
// Composition is dynamic: slots are filled from the Next Best Action ranking and
// the available question bank, skipping any slot that cannot be filled.

import type { NbaItem, SkillSnapshot } from './nba';

export interface QuestionMeta {
  id: string;
  skills: string[];
  difficulty: number;
  provenance?: string;
}

export type SessionSlot = 'retrieval' | 'confidence' | 'challenge' | 'spaced' | 'exam';

export interface SessionItem {
  slot: SessionSlot;
  questionId: string;
  skillId: string;
}

export interface ComposedSession {
  durationMinutes: number;
  recommendedSkills: string[];
  questionIds: string[];
  items: SessionItem[];
  /** Internal-only estimate (spec §14); not for display. */
  expectedLearningGain: number;
}

export interface ComposeOptions {
  states?: Map<string, SkillSnapshot>;
  /** Questions the student already answered (avoid, except spaced slot). */
  answeredRecently?: Set<string>;
  durationMinutes?: number;
}

interface SlotSpec {
  slot: SessionSlot;
  preferredDifficulty: number;
  /** Allow reusing a previously-answered question (spaced repetition). */
  allowSeen: boolean;
}

const SLOT_PLAN: SlotSpec[] = [
  { slot: 'retrieval', preferredDifficulty: 0.5, allowSeen: false },
  { slot: 'confidence', preferredDifficulty: 0.3, allowSeen: false },
  { slot: 'challenge', preferredDifficulty: 0.8, allowSeen: false },
  { slot: 'spaced', preferredDifficulty: 0.5, allowSeen: true },
  { slot: 'exam', preferredDifficulty: 0.75, allowSeen: false },
];

/**
 * Compose a mixed practice session. `nba` should be pre-ranked (highest
 * priority first). Returns up to 5 items; fewer if the bank is thin.
 */
export function composeSession(
  nba: NbaItem[],
  questions: QuestionMeta[],
  opts: ComposeOptions = {},
): ComposedSession {
  const durationMinutes = opts.durationMinutes ?? 15;
  const answered = opts.answeredRecently ?? new Set<string>();

  // Priority order of skills to draw from; ensure at least something even if
  // all priorities are 0 (everything mastered) by keeping the ranking order.
  const rankedSkills = nba.map((n) => n.skillId);
  const priorityOf = new Map(nba.map((n) => [n.skillId, n.priority] as const));
  const rankIndex = new Map(rankedSkills.map((s, i) => [s, i] as const));

  const chosen = new Set<string>();
  const items: SessionItem[] = [];

  function questionRank(skillId: string): number {
    const idx = rankIndex.get(skillId);
    return idx === undefined ? rankedSkills.length : idx;
  }

  function pickForSlot(spec: SlotSpec): SessionItem | null {
    let best: { q: QuestionMeta; skillId: string; score: number } | null = null;
    for (const q of questions) {
      if (chosen.has(q.id)) continue;
      const seen = answered.has(q.id);
      if (seen && !spec.allowSeen) continue;
      if (!seen && spec.allowSeen) continue; // spaced slot wants a seen item

      // The most relevant skill this question trains (highest NBA rank).
      const skillId = [...q.skills].sort((a, b) => questionRank(a) - questionRank(b))[0];
      if (!skillId) continue;

      const skillScore = 1 - questionRank(skillId) / (rankedSkills.length || 1);
      const difficultyScore = 1 - Math.abs(q.difficulty - spec.preferredDifficulty);
      const provenanceBonus = spec.slot === 'exam' && q.provenance === 'official' ? 0.5 : 0;
      const score = skillScore + difficultyScore + provenanceBonus;

      if (
        !best ||
        score > best.score ||
        (score === best.score && q.id < best.q.id) // deterministic tie-break
      ) {
        best = { q, skillId, score };
      }
    }
    if (!best) return null;
    chosen.add(best.q.id);
    return { slot: spec.slot, questionId: best.q.id, skillId: best.skillId };
  }

  for (const spec of SLOT_PLAN) {
    const item = pickForSlot(spec);
    if (item) items.push(item);
  }

  const recommendedSkills = [...new Set(items.map((i) => i.skillId))];
  // Internal estimate: sum of chosen skills' NBA priority.
  const expectedLearningGain =
    Math.round(items.reduce((sum, i) => sum + (priorityOf.get(i.skillId) ?? 0), 0) * 1000) / 1000;

  return {
    durationMinutes,
    recommendedSkills,
    questionIds: items.map((i) => i.questionId),
    items,
    expectedLearningGain,
  };
}
