import { describe, it, expect } from 'vitest';
import {
  nextBestActions,
  computeFactors,
  prerequisiteReadinessFrom,
  type SkillSnapshot,
} from './nba';

const snap = (skillId: string, p: number, confidence = 0.5, evidenceCount = 3): SkillSnapshot => ({
  skillId,
  masteryProbability: p,
  confidence,
  evidenceCount,
});

describe('nextBestActions', () => {
  it('gives mastered skills zero priority', () => {
    const [item] = nextBestActions([snap('m', 0.9)]);
    expect(item.factors.skillGap).toBe(0);
    expect(item.priority).toBe(0);
  });

  it('ranks a moderately weak skill above a fully mastered one', () => {
    const ranked = nextBestActions([snap('mastered', 0.9), snap('weak', 0.3)]);
    expect(ranked[0].skillId).toBe('weak');
    expect(ranked[0].priority).toBeGreaterThan(ranked[1].priority);
  });

  it('tags low mastery and high learning value with reason codes', () => {
    const [item] = nextBestActions([snap('weak', 0.3, 0.6)]);
    expect(item.reasonCodes).toContain('LOW_MASTERY');
  });

  it('flags a skill with no evidence as NEEDS_EVIDENCE', () => {
    const [item] = nextBestActions([snap('new', 0.5, 0, 0)]);
    expect(item.reasonCodes).toContain('NEEDS_EVIDENCE');
  });

  it('zeroes priority for off-target skills when target relevance is 0', () => {
    const ranked = nextBestActions([snap('weak', 0.3)], {
      targetRelevance: () => 0,
    });
    expect(ranked[0].priority).toBe(0);
  });

  it('dampens recently practised skills', () => {
    const base = nextBestActions([snap('s', 0.4)])[0].priority;
    const damped = nextBestActions([snap('s', 0.4)], {
      recentCounts: new Map([['s', 2]]),
    })[0];
    expect(damped.priority).toBeLessThan(base);
    expect(damped.reasonCodes).toContain('RECENTLY_PRACTICED');
  });

  it('is deterministic for equal priorities (tie-break by skillId)', () => {
    const ranked = nextBestActions([snap('b', 0.4), snap('a', 0.4)]);
    expect(ranked.map((r) => r.skillId)).toEqual(['a', 'b']);
  });
});

describe('computeFactors', () => {
  it('peaks learning value at mid mastery', () => {
    const mid = computeFactors(snap('x', 0.5)).learningValue;
    const low = computeFactors(snap('x', 0.1)).learningValue;
    const high = computeFactors(snap('x', 0.9)).learningValue;
    expect(mid).toBeGreaterThan(low);
    expect(mid).toBeGreaterThan(high);
  });
});

describe('prerequisiteReadinessFrom', () => {
  it('is 1 when a skill has no prerequisites', () => {
    const readiness = prerequisiteReadinessFrom(new Map(), () => []);
    expect(readiness('x')).toBe(1);
  });

  it('drops when a prerequisite is weak', () => {
    const states = new Map<string, SkillSnapshot>([['prereq', snap('prereq', 0.3)]]);
    const readiness = prerequisiteReadinessFrom(states, (id) => (id === 'x' ? ['prereq'] : []));
    expect(readiness('x')).toBeLessThan(1);
  });

  it('is full when prerequisites are strong', () => {
    const states = new Map<string, SkillSnapshot>([['prereq', snap('prereq', 0.9)]]);
    const readiness = prerequisiteReadinessFrom(states, (id) => (id === 'x' ? ['prereq'] : []));
    expect(readiness('x')).toBe(1);
  });
});
