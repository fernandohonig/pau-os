// Shared API types, consumed by the client and the UI. These mirror the
// contract documented in docs/api.md.

export type MasteryBand = 'insufficient_evidence' | 'weak' | 'developing' | 'mastered';

export type StopReason = 'confident' | 'exhausted' | 'max_questions';

export interface Student {
  id: string;
  createdAt?: string;
}

export interface LocalizedText {
  ca: string;
  es?: string;
}

export interface QuestionOption {
  id: string;
  ca: string;
  es?: string;
}

/** A question as sent to clients — never includes the answer or explanation. */
export interface PublicQuestion {
  id: string;
  type: string;
  skills: string[];
  difficulty: number;
  question: LocalizedText;
  options: QuestionOption[];
}

export interface AssessmentStart {
  assessmentId: string;
  question: PublicQuestion;
  progress: { asked: number };
}

export type ResponseResult =
  | { done: false; question: PublicQuestion; progress: { asked: number } }
  | { done: true; stopReason: StopReason; progress: { asked: number } };

export interface LevelEstimate {
  level: number;
  range: [number, number];
  confidence: number;
}

export interface ProfileBandItem {
  skillId: string;
  band: MasteryBand;
}

export interface Recommendation {
  skillId: string;
  reasonCodes: string[];
  explanation: string;
}

export interface DiagnosticResults {
  level: LevelEstimate;
  assessedSkillCount: number;
  gaps: ProfileBandItem[];
  strengths: ProfileBandItem[];
  recommendation: Recommendation | null;
}

export interface SkillProfileItem {
  skillId: string;
  band: MasteryBand;
  confidence: number;
  evidenceCount: number;
}

export interface Weighting {
  subject: string;
  coefficient: number;
}

export interface Degree {
  id: string;
  university: string;
  name: LocalizedText;
  weightings?: Weighting[];
}

export interface University {
  id: string;
  name: LocalizedText;
  region: string;
}

export interface CutoffInfo {
  academicYear: number;
  assignment: string;
  score: number;
  sourceType: string;
  sourceAuthority: string | null;
}

export interface SubjectContribution {
  subject: string;
  coefficient: number;
  points: number;
  range: [number, number];
}

export type TargetEstimate =
  | { goal: null }
  | {
      goal: { degreeId: string; targetScore: number | null };
      degreeName: string;
      subjectLevel: { level: number; range: [number, number]; confidence: number; assessedSkillCount: number };
      contribution: SubjectContribution | null;
      cutoff: CutoffInfo | null;
      disclaimer: string;
    };

export interface Goal {
  id: string;
  studentId: string;
  degreeId: string;
  targetScore: number | null;
}

export type PracticeNext =
  | { done: true }
  | { done?: false; skillId: string; question: PublicQuestion };

export interface PracticeAnswerResult {
  correct: boolean;
  outcome: 'correct' | 'incorrect' | 'idk';
  explanation: LocalizedText;
  skills: ProfileBandItem[];
}
