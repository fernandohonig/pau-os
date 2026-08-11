import { describe, it, expect } from 'vitest';
import {
  updateMastery,
  evidenceStep,
  masteryBand,
  INITIAL_MASTERY,
  DEFAULT_UPDATE_CONFIG,
  type MasteryState,
} from './mastery';

describe('updateMastery', () => {
  it('increases mastery on a correct answer', () => {
    const next = updateMastery(INITIAL_MASTERY, 'correct', 0.5);
    expect(next.masteryProbability).toBeGreaterThan(0.5);
    expect(next.evidenceCount).toBe(1);
  });

  it('decreases mastery on an incorrect answer', () => {
    const next = updateMastery(INITIAL_MASTERY, 'incorrect', 0.5);
    expect(next.masteryProbability).toBeLessThan(0.5);
  });

  it('decreases mastery on "I don\'t know", but less than an easy wrong answer', () => {
    const idk = updateMastery(INITIAL_MASTERY, 'idk', 0.2);
    const wrong = updateMastery(INITIAL_MASTERY, 'incorrect', 0.2);
    expect(idk.masteryProbability).toBeLessThan(0.5);
    expect(idk.masteryProbability).toBeGreaterThan(wrong.masteryProbability);
  });

  it('treats "I don\'t know" as difficulty-independent', () => {
    const easy = updateMastery(INITIAL_MASTERY, 'idk', 0.1);
    const hard = updateMastery(INITIAL_MASTERY, 'idk', 0.9);
    expect(easy.masteryProbability).toBeCloseTo(hard.masteryProbability, 10);
  });

  it('gives a harder correct answer stronger positive evidence than an easier one', () => {
    const easy = updateMastery(INITIAL_MASTERY, 'correct', 0.2);
    const hard = updateMastery(INITIAL_MASTERY, 'correct', 0.9);
    expect(hard.masteryProbability).toBeGreaterThan(easy.masteryProbability);
  });

  it('gives an easier wrong answer stronger negative evidence than a harder one', () => {
    const easyWrong = updateMastery(INITIAL_MASTERY, 'incorrect', 0.1);
    const hardWrong = updateMastery(INITIAL_MASTERY, 'incorrect', 0.9);
    expect(easyWrong.masteryProbability).toBeLessThan(hardWrong.masteryProbability);
  });

  it('applies diminishing information for repeated evidence on the same skill', () => {
    const first = updateMastery(INITIAL_MASTERY, 'correct', 0.5);
    const second = updateMastery(first, 'correct', 0.5);
    const firstDelta = first.masteryProbability - INITIAL_MASTERY.masteryProbability;
    const secondDelta = second.masteryProbability - first.masteryProbability;
    expect(secondDelta).toBeLessThan(firstDelta);
  });

  it('increases confidence monotonically with evidence', () => {
    let state = INITIAL_MASTERY;
    const confidences: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = updateMastery(state, 'correct', 0.5);
      confidences.push(state.confidence);
    }
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i]).toBeGreaterThan(confidences[i - 1]);
    }
  });

  it('keeps probability strictly within (0,1) even under many extreme answers', () => {
    let state = INITIAL_MASTERY;
    for (let i = 0; i < 50; i++) state = updateMastery(state, 'correct', 1);
    expect(state.masteryProbability).toBeLessThan(1);
    expect(state.masteryProbability).toBeGreaterThan(0);

    let low = INITIAL_MASTERY;
    for (let i = 0; i < 50; i++) low = updateMastery(low, 'incorrect', 0);
    expect(low.masteryProbability).toBeGreaterThan(0);
    expect(low.masteryProbability).toBeLessThan(1);
  });
});

describe('evidenceStep', () => {
  it('is positive for correct and negative for incorrect/idk', () => {
    expect(evidenceStep('correct', 0.5, DEFAULT_UPDATE_CONFIG)).toBeGreaterThan(0);
    expect(evidenceStep('incorrect', 0.5, DEFAULT_UPDATE_CONFIG)).toBeLessThan(0);
    expect(evidenceStep('idk', 0.5, DEFAULT_UPDATE_CONFIG)).toBeLessThan(0);
  });
});

describe('masteryBand', () => {
  const mk = (p: number, evidenceCount: number): MasteryState => ({
    masteryProbability: p,
    confidence: 0.5,
    evidenceCount,
  });

  it('reports insufficient evidence below the evidence threshold', () => {
    expect(masteryBand(mk(0.9, 1))).toBe('insufficient_evidence');
  });

  it('classifies bands by probability once there is enough evidence', () => {
    expect(masteryBand(mk(0.8, 3))).toBe('mastered');
    expect(masteryBand(mk(0.6, 3))).toBe('developing');
    expect(masteryBand(mk(0.3, 3))).toBe('weak');
  });
});
