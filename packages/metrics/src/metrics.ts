// Learning-validation metrics (spec §26 Weeks 7–8, §1 success metrics).
//
// The primary metric is Learning Gain / Hour. These are pure functions over
// plain records so they are unit-testable and reusable by the API/analytics
// layer. Timestamps are passed as epoch milliseconds (no clock access here).

import { updateMastery, INITIAL_MASTERY, type MasteryState, type Outcome } from '@pau/scoring';
import { estimateLevel, type LevelEstimate, type SkillStateEntry } from '@pau/knowledge-model';

export interface AttemptRecord {
  skillId: string;
  difficulty: number;
  outcome: Outcome;
}

/**
 * Reconstruct the subject-level estimate implied by a single set of attempts
 * (e.g. one diagnostic's responses), by replaying the mastery model from the
 * prior. Lets us snapshot "level at that assessment" without storing history.
 */
export function levelFromAttempts(attempts: AttemptRecord[]): LevelEstimate {
  const states = new Map<string, MasteryState>();
  for (const a of attempts) {
    const prev = states.get(a.skillId) ?? INITIAL_MASTERY;
    states.set(a.skillId, updateMastery(prev, a.outcome, a.difficulty));
  }
  const entries: SkillStateEntry[] = [...states].map(([skillId, state]) => ({ skillId, state }));
  return estimateLevel(entries);
}

export interface LearningGain {
  preLevel: number;
  postLevel: number;
  /** Post minus pre, on the 0–10 scale. */
  gain: number;
}

export function learningGain(pre: LevelEstimate, post: LevelEstimate): LearningGain {
  const gain = Math.round((post.level - pre.level) * 10) / 10;
  return { preLevel: pre.level, postLevel: post.level, gain };
}

/** Learning gain per study hour — the primary success metric. Null if no time. */
export function learningGainPerHour(gain: number, studyMinutes: number): number | null {
  if (studyMinutes <= 0) return null;
  return Math.round((gain / (studyMinutes / 60)) * 100) / 100;
}

/** Total study minutes from completed practice sessions. */
export function studyMinutes(sessionDurations: Array<number | null | undefined>): number {
  return sessionDurations.reduce<number>((sum, d) => sum + (d ?? 0), 0);
}

/**
 * Retention: was the student active within [fromDay, toDay] after first seen?
 * Day 0 is the first-seen instant; week-1 ≈ days 1–7, week-4 ≈ days 22–28.
 */
export function retainedInWindow(
  firstSeenMs: number,
  activityMs: number[],
  fromDay: number,
  toDay: number,
): boolean {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = firstSeenMs + fromDay * dayMs;
  const end = firstSeenMs + toDay * dayMs;
  return activityMs.some((t) => t >= start && t <= end);
}

export interface StudentMetrics {
  startedDiagnostic: boolean;
  completedDiagnostic: boolean;
  gain?: number | null;
  gainPerHour?: number | null;
  studyMinutes: number;
  completedSessions: number;
}

export interface CohortSummary {
  students: number;
  diagnosticStarted: number;
  diagnosticCompleted: number;
  diagnosticCompletionRate: number;
  avgStudyMinutes: number;
  avgLearningGain: number | null;
  avgLearningGainPerHour: number | null;
  studentsWithGain: number;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Aggregate per-student metrics into a cohort summary. */
export function summarizeCohort(students: StudentMetrics[]): CohortSummary {
  const n = students.length;
  const started = students.filter((s) => s.startedDiagnostic).length;
  const completed = students.filter((s) => s.completedDiagnostic).length;
  const gains = students.map((s) => s.gain).filter((g): g is number => typeof g === 'number');
  const gainsPerHour = students
    .map((s) => s.gainPerHour)
    .filter((g): g is number => typeof g === 'number');

  return {
    students: n,
    diagnosticStarted: started,
    diagnosticCompleted: completed,
    diagnosticCompletionRate: started ? Math.round((completed / started) * 100) / 100 : 0,
    avgStudyMinutes: Math.round(avg(students.map((s) => s.studyMinutes))),
    avgLearningGain: gains.length ? Math.round(avg(gains) * 10) / 10 : null,
    avgLearningGainPerHour: gainsPerHour.length ? Math.round(avg(gainsPerHour) * 100) / 100 : null,
    studentsWithGain: gains.length,
  };
}
