import { describe, it, expect } from 'vitest';
import { composeSession, type QuestionMeta } from './session';
import { nextBestActions, type SkillSnapshot } from './nba';

const snap = (skillId: string, p: number): SkillSnapshot => ({
  skillId,
  masteryProbability: p,
  confidence: 0.5,
  evidenceCount: 3,
});

// A bank spanning several skills across a range of difficulties.
function bank(): QuestionMeta[] {
  const qs: QuestionMeta[] = [];
  for (const s of ['weak', 'mid', 'strong']) {
    for (const d of [0.3, 0.5, 0.8]) {
      qs.push({ id: `${s}-${Math.round(d * 100)}`, skills: [s], difficulty: d });
    }
  }
  return qs;
}

describe('composeSession', () => {
  const nba = nextBestActions([snap('weak', 0.25), snap('mid', 0.55), snap('strong', 0.9)]);

  it('produces a mixed session with unique questions', () => {
    const session = composeSession(nba, bank());
    expect(session.questionIds.length).toBeGreaterThan(0);
    expect(new Set(session.questionIds).size).toBe(session.questionIds.length);
    expect(session.durationMinutes).toBe(15);
  });

  it('picks an easier item for the confidence slot than for the challenge slot', () => {
    const session = composeSession(nba, bank());
    const conf = session.items.find((i) => i.slot === 'confidence');
    const chal = session.items.find((i) => i.slot === 'challenge');
    if (conf && chal) {
      const diff = (id: string) => Number(id.split('-')[1]);
      expect(diff(conf.questionId)).toBeLessThan(diff(chal.questionId));
    }
  });

  it('uses a previously-seen question for the spaced slot', () => {
    const answered = new Set(['mid-50']);
    const session = composeSession(nba, bank(), { answeredRecently: answered });
    const spaced = session.items.find((i) => i.slot === 'spaced');
    if (spaced) expect(answered.has(spaced.questionId)).toBe(true);
    // Fresh (non-spaced) slots must avoid answered questions.
    for (const item of session.items.filter((i) => i.slot !== 'spaced')) {
      expect(answered.has(item.questionId)).toBe(false);
    }
  });

  it('reports an internal expected learning gain', () => {
    const session = composeSession(nba, bank());
    expect(typeof session.expectedLearningGain).toBe('number');
    expect(session.expectedLearningGain).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    const a = composeSession(nba, bank());
    const b = composeSession(nba, bank());
    expect(a.questionIds).toEqual(b.questionIds);
  });

  it('handles a thin bank without duplicating questions', () => {
    const thin: QuestionMeta[] = [{ id: 'only', skills: ['weak'], difficulty: 0.5 }];
    const session = composeSession(nba, thin);
    expect(session.questionIds).toEqual(['only']);
  });
});
