import { describe, it, expect } from 'vitest';
import {
  subjectContribution,
  estimateSubjectContribution,
  buildTargetRelevance,
} from './admission';

describe('subjectContribution', () => {
  it('is mark × coefficient, clamped to a 0–10 mark', () => {
    expect(subjectContribution(10, 0.2)).toBe(2);
    expect(subjectContribution(7.5, 0.2)).toBe(1.5);
    expect(subjectContribution(15, 0.2)).toBe(2); // clamped
    expect(subjectContribution(-3, 0.2)).toBe(0); // clamped
  });
});

describe('estimateSubjectContribution', () => {
  const weightings = [{ subject: 'mathematics-ii', coefficient: 0.2 }];

  it('maps a level estimate to a points contribution with a range', () => {
    const c = estimateSubjectContribution({ level: 8, range: [6.4, 9] }, weightings, 'mathematics-ii');
    expect(c).not.toBeNull();
    expect(c?.coefficient).toBe(0.2);
    expect(c?.points).toBe(1.6);
    expect(c?.range).toEqual([1.28, 1.8]);
  });

  it('returns null when the subject is not weighted by the degree', () => {
    const c = estimateSubjectContribution({ level: 8, range: [7, 9] }, weightings, 'physics');
    expect(c).toBeNull();
  });
});

describe('buildTargetRelevance', () => {
  const subjectOf = (skillId: string) => (skillId.startsWith('mathematics') ? 'mathematics-ii' : undefined);

  it('gives full relevance to the weighted subject and 0 to others', () => {
    const rel = buildTargetRelevance([{ subject: 'mathematics-ii', coefficient: 0.2 }], subjectOf);
    expect(rel('mathematics.calculus.derivatives')).toBe(1);
    expect(rel('physics.kinematics')).toBe(0);
  });

  it('normalizes across multiple weighted subjects', () => {
    const rel = buildTargetRelevance(
      [
        { subject: 'mathematics-ii', coefficient: 0.2 },
        { subject: 'physics', coefficient: 0.1 },
      ],
      (id) => (id.startsWith('mathematics') ? 'mathematics-ii' : 'physics'),
    );
    expect(rel('mathematics.x')).toBe(1); // 0.2 / 0.2
    expect(rel('physics.y')).toBeCloseTo(0.5, 5); // 0.1 / 0.2
  });

  it('returns 0 relevance when there are no weightings', () => {
    const rel = buildTargetRelevance([], subjectOf);
    expect(rel('mathematics.x')).toBe(0);
  });
});
