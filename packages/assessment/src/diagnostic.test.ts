import { describe, it, expect } from 'vitest';
import {
  selectNextQuestion,
  evaluateStop,
  averageUncertainty,
  coveredSkillCount,
  DEFAULT_DIAGNOSTIC_CONFIG,
  type QuestionMeta,
} from './diagnostic';
import { INITIAL_MASTERY, updateMastery, type MasteryState, type Outcome } from '@pau/scoring';

const q = (id: string, skills: string[], difficulty: number): QuestionMeta => ({ id, skills, difficulty });

describe('selectNextQuestion', () => {
  it('returns null when all questions have been asked', () => {
    const questions = [q('a', ['s1'], 0.5)];
    const asked = new Set(['a']);
    expect(selectNextQuestion(questions, new Map(), asked)).toBeNull();
  });

  it('prefers a question covering an unassessed skill over a repeat skill', () => {
    const questions = [q('seen', ['s1'], 0.5), q('fresh', ['s2'], 0.5)];
    const states = new Map<string, MasteryState>([['s1', updateMastery(INITIAL_MASTERY, 'correct', 0.5)]]);
    const asked = new Set(['prev']); // prev not in bank; s1 has evidence, s2 does not
    // Add a prior asked question that touched s1 so repetition/coverage favor s2.
    const bank = [q('prev', ['s1'], 0.5), ...questions];
    expect(selectNextQuestion(bank, states, asked)).toBe('fresh');
  });

  it('starts at medium difficulty when there is no evidence', () => {
    // With no evidence all skills sit at p=0.5, so difficulty match favors ~0.5.
    const questions = [q('easy', ['s1'], 0.1), q('medium', ['s1'], 0.5), q('hard', ['s1'], 0.95)];
    const picked = selectNextQuestion(questions, new Map(), new Set());
    expect(picked).toBe('medium');
  });

  it('is deterministic: equal scores break by smallest id', () => {
    const questions = [q('b', ['s1'], 0.5), q('a', ['s1'], 0.5)];
    expect(selectNextQuestion(questions, new Map(), new Set())).toBe('a');
    // And stable across repeated calls.
    expect(selectNextQuestion(questions, new Map(), new Set())).toBe('a');
  });
});

describe('evaluateStop', () => {
  const questions = Array.from({ length: 30 }, (_, i) => q(`q${i}`, [`s${i}`], 0.5));

  it('stops at the max question count', () => {
    const asked = new Set(questions.slice(0, DEFAULT_DIAGNOSTIC_CONFIG.maxQuestions).map((x) => x.id));
    expect(evaluateStop(questions, new Map(), asked)).toBe('max_questions');
  });

  it('stops when the bank is exhausted', () => {
    const small = [q('a', ['s1'], 0.5)];
    expect(evaluateStop(small, new Map(), new Set(['a']))).toBe('exhausted');
  });

  it('does not stop before the minimum question count', () => {
    expect(evaluateStop(questions, new Map(), new Set(['q0']))).toBeNull();
  });

  it('stops with "confident" once coverage and low uncertainty are reached', () => {
    // Build well-evidenced (high-confidence, extreme p) states for enough skills.
    const states = new Map<string, MasteryState>();
    for (let i = 0; i < DEFAULT_DIAGNOSTIC_CONFIG.minSkillCoverage; i++) {
      let s = INITIAL_MASTERY;
      for (let k = 0; k < 8; k++) s = updateMastery(s, 'correct', 0.9);
      states.set(`s${i}`, s);
    }
    const asked = new Set(Array.from({ length: DEFAULT_DIAGNOSTIC_CONFIG.minQuestions }, (_, i) => `q${i}`));
    expect(averageUncertainty(states)).toBeLessThanOrEqual(DEFAULT_DIAGNOSTIC_CONFIG.uncertaintyThreshold);
    expect(coveredSkillCount(states)).toBeGreaterThanOrEqual(DEFAULT_DIAGNOSTIC_CONFIG.minSkillCoverage);
    expect(evaluateStop(questions, states, asked)).toBe('confident');
  });
});

describe('full diagnostic simulation', () => {
  // A bank spanning 8 skills at 3 difficulties each.
  const skills = ['alg', 'fun', 'der', 'int', 'mat', 'det', 'vec', 'prob'];
  const bank: QuestionMeta[] = [];
  for (const s of skills) {
    for (const d of [0.3, 0.5, 0.8]) {
      bank.push(q(`${s}-${Math.round(d * 100)}`, [s], d));
    }
  }
  // The simulated student "knows" half the skills.
  const known = new Set(['alg', 'fun', 'der', 'mat']);
  const oracle = (skill: string, difficulty: number): Outcome => {
    if (known.has(skill)) return difficulty > 0.9 ? 'incorrect' : 'correct';
    return 'incorrect';
  };

  it('terminates, respects the max, and covers many skills', () => {
    const states = new Map<string, MasteryState>();
    const asked = new Set<string>();

    let guard = 0;
    while (evaluateStop(bank, states, asked) === null) {
      const nextId = selectNextQuestion(bank, states, asked);
      expect(nextId).not.toBeNull();
      const question = bank.find((x) => x.id === nextId)!;
      const skill = question.skills[0];
      const outcome = oracle(skill, question.difficulty);
      states.set(skill, updateMastery(states.get(skill) ?? INITIAL_MASTERY, outcome, question.difficulty));
      asked.add(question.id);

      if (++guard > 100) throw new Error('diagnostic did not terminate');
    }

    expect(asked.size).toBeLessThanOrEqual(DEFAULT_DIAGNOSTIC_CONFIG.maxQuestions);
    expect(asked.size).toBeGreaterThanOrEqual(DEFAULT_DIAGNOSTIC_CONFIG.minQuestions);
    // Should have sampled a broad set of skills, not hammered one.
    expect(coveredSkillCount(states)).toBeGreaterThanOrEqual(6);

    // Known skills should trend higher than unknown ones.
    const knownAvg = [...known].map((s) => states.get(s)?.masteryProbability ?? 0.5);
    const unknownAvg = skills.filter((s) => !known.has(s)).map((s) => states.get(s)?.masteryProbability ?? 0.5);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(knownAvg)).toBeGreaterThan(mean(unknownAvg));
  });
});
