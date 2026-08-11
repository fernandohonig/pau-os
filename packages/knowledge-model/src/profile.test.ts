import { describe, it, expect } from 'vitest';
import { estimateLevel, topGaps, topStrengths, buildSkillProfile, type SkillStateEntry } from './profile';
import { recommendFromGaps } from './recommendation';

const entry = (skillId: string, p: number, evidenceCount: number, confidence = 0.5): SkillStateEntry => ({
  skillId,
  state: { masteryProbability: p, confidence, evidenceCount },
});

describe('estimateLevel', () => {
  it('returns a zeroed estimate when nothing is assessed', () => {
    const est = estimateLevel([entry('a', 0.5, 0)]);
    expect(est.assessedSkillCount).toBe(0);
    expect(est.level).toBe(0);
    expect(est.range).toEqual([0, 0]);
  });

  it('maps mean mastery to a 0-10 level', () => {
    const est = estimateLevel([entry('a', 0.8, 4, 1), entry('b', 0.6, 4, 1)]);
    expect(est.level).toBeCloseTo(7, 1);
    expect(est.assessedSkillCount).toBe(2);
  });

  it('produces a wider range when confidence is low', () => {
    const lowConf = estimateLevel([entry('a', 0.7, 1, 0.1)]);
    const highConf = estimateLevel([entry('a', 0.7, 20, 0.95)]);
    const widthLow = lowConf.range[1] - lowConf.range[0];
    const widthHigh = highConf.range[1] - highConf.range[0];
    expect(widthLow).toBeGreaterThan(widthHigh);
  });

  it('keeps the range within [0,10]', () => {
    const est = estimateLevel([entry('a', 0.98, 1, 0.05)]);
    expect(est.range[0]).toBeGreaterThanOrEqual(0);
    expect(est.range[1]).toBeLessThanOrEqual(10);
  });
});

describe('topGaps / topStrengths', () => {
  const entries = [
    entry('weak1', 0.2, 3),
    entry('weak2', 0.35, 3),
    entry('developing', 0.6, 3),
    entry('mastered1', 0.85, 3),
    entry('mastered2', 0.9, 3),
    entry('unassessed', 0.5, 0),
  ];

  it('orders gaps by lowest mastery and excludes mastered / unassessed', () => {
    const gaps = topGaps(entries, 3);
    expect(gaps.map((g) => g.skillId)).toEqual(['weak1', 'weak2', 'developing']);
  });

  it('orders strengths by highest mastery', () => {
    const strengths = topStrengths(entries, 3);
    expect(strengths.map((s) => s.skillId)).toEqual(['mastered2', 'mastered1']);
  });

  it('marks skills with too little evidence as insufficient_evidence', () => {
    const profile = buildSkillProfile([entry('x', 0.9, 1)]);
    expect(profile[0].band).toBe('insufficient_evidence');
  });
});

describe('recommendFromGaps', () => {
  it('recommends the weakest gap with reason codes', () => {
    const gaps = topGaps([entry('weak1', 0.2, 3, 0.4), entry('dev', 0.6, 3)]);
    const rec = recommendFromGaps(gaps);
    expect(rec?.skillId).toBe('weak1');
    expect(rec?.reasonCodes).toContain('LOW_MASTERY');
    expect(rec?.reasonCodes).toContain('LOW_CONFIDENCE');
    expect(rec?.explanation.length).toBeGreaterThan(0);
  });

  it('returns null when there are no gaps', () => {
    expect(recommendFromGaps([])).toBeNull();
  });
});
