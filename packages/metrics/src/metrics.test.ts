import { describe, it, expect } from 'vitest';
import {
  levelFromAttempts,
  learningGain,
  learningGainPerHour,
  studyMinutes,
  retainedInWindow,
  summarizeCohort,
  type AttemptRecord,
  type StudentMetrics,
} from './metrics';

describe('levelFromAttempts', () => {
  it('reconstructs a higher level from mostly-correct attempts', () => {
    const good: AttemptRecord[] = [
      { skillId: 'a', difficulty: 0.5, outcome: 'correct' },
      { skillId: 'a', difficulty: 0.6, outcome: 'correct' },
      { skillId: 'b', difficulty: 0.5, outcome: 'correct' },
    ];
    const bad: AttemptRecord[] = [
      { skillId: 'a', difficulty: 0.5, outcome: 'incorrect' },
      { skillId: 'a', difficulty: 0.6, outcome: 'incorrect' },
      { skillId: 'b', difficulty: 0.5, outcome: 'idk' },
    ];
    expect(levelFromAttempts(good).level).toBeGreaterThan(levelFromAttempts(bad).level);
  });

  it('returns a zeroed estimate for no attempts', () => {
    expect(levelFromAttempts([]).level).toBe(0);
  });
});

describe('learningGain', () => {
  it('is post minus pre', () => {
    const g = learningGain({ level: 5, range: [4, 6], confidence: 0.5, assessedSkillCount: 3 }, { level: 7, range: [6, 8], confidence: 0.6, assessedSkillCount: 3 });
    expect(g.gain).toBe(2);
    expect(g.preLevel).toBe(5);
    expect(g.postLevel).toBe(7);
  });
});

describe('learningGainPerHour', () => {
  it('divides gain by study hours', () => {
    expect(learningGainPerHour(2, 60)).toBe(2);
    expect(learningGainPerHour(1, 30)).toBe(2);
  });
  it('is null with no study time', () => {
    expect(learningGainPerHour(2, 0)).toBeNull();
  });
});

describe('studyMinutes', () => {
  it('sums durations, ignoring nulls', () => {
    expect(studyMinutes([15, null, 10, undefined])).toBe(25);
  });
});

describe('retainedInWindow', () => {
  const day = 24 * 60 * 60 * 1000;
  const t0 = 1_000_000_000_000;
  it('detects week-1 activity', () => {
    expect(retainedInWindow(t0, [t0 + 3 * day], 1, 7)).toBe(true);
  });
  it('returns false when there is no activity in the window', () => {
    expect(retainedInWindow(t0, [t0 + 10 * day], 1, 7)).toBe(false);
  });
  it('detects week-4 activity', () => {
    expect(retainedInWindow(t0, [t0 + 25 * day], 22, 28)).toBe(true);
  });
});

describe('summarizeCohort', () => {
  const students: StudentMetrics[] = [
    { startedDiagnostic: true, completedDiagnostic: true, gain: 2, gainPerHour: 2, studyMinutes: 60, completedSessions: 2 },
    { startedDiagnostic: true, completedDiagnostic: true, gain: 1, gainPerHour: 1, studyMinutes: 60, completedSessions: 1 },
    { startedDiagnostic: true, completedDiagnostic: false, studyMinutes: 0, completedSessions: 0 },
  ];

  it('computes completion rate and averages', () => {
    const s = summarizeCohort(students);
    expect(s.students).toBe(3);
    expect(s.diagnosticStarted).toBe(3);
    expect(s.diagnosticCompleted).toBe(2);
    expect(s.diagnosticCompletionRate).toBeCloseTo(0.67, 2);
    expect(s.avgLearningGain).toBe(1.5);
    expect(s.avgLearningGainPerHour).toBe(1.5);
    expect(s.studentsWithGain).toBe(2);
  });

  it('handles an empty cohort', () => {
    const s = summarizeCohort([]);
    expect(s.students).toBe(0);
    expect(s.diagnosticCompletionRate).toBe(0);
    expect(s.avgLearningGain).toBeNull();
  });
});
