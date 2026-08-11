// Self-contained API client for the app. Mirrors @pau/api-client (the canonical
// typed client) but is kept in-app to avoid bundling workspace TypeScript
// through Metro. Base URL comes from app.json `extra.apiBaseUrl`.

import Constants from 'expo-constants';

const baseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000';

export interface LocalizedText {
  ca: string;
  es?: string;
}
export interface QuestionOption {
  id: string;
  ca: string;
  es?: string;
}
export interface PublicQuestion {
  id: string;
  type: string;
  skills: string[];
  difficulty: number;
  question: LocalizedText;
  options: QuestionOption[];
}
export type MasteryBand = 'insufficient_evidence' | 'weak' | 'developing' | 'mastered';
export interface ProfileBandItem {
  skillId: string;
  band: MasteryBand;
}
export interface DiagnosticResults {
  level: { level: number; range: [number, number]; confidence: number };
  assessedSkillCount: number;
  gaps: ProfileBandItem[];
  strengths: ProfileBandItem[];
  recommendation: { skillId: string; reasonCodes: string[]; explanation: string } | null;
}
export interface Degree {
  id: string;
  university: string;
  name: LocalizedText;
}
export interface SkillProfileItem {
  skillId: string;
  band: MasteryBand;
  confidence: number;
  evidenceCount: number;
}
export type TargetEstimate =
  | { goal: null }
  | {
      goal: { degreeId: string; targetScore: number | null };
      degreeName: string;
      subjectLevel: { level: number; range: [number, number]; confidence: number; assessedSkillCount: number };
      contribution: { subject: string; coefficient: number; points: number; range: [number, number] } | null;
      cutoff: { score: number; assignment: string; academicYear: number; sourceType: string } | null;
      disclaimer: string;
    };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error((json && json.error) || `request_failed_${res.status}`);
  return json as T;
}

export const api = {
  createStudent: () => req<{ id: string }>('POST', '/v1/students'),
  getDegrees: () => req<{ degrees: Degree[]; provisional: boolean }>('GET', '/v1/catalog/degrees'),
  getSkillCatalog: () => req<{ skills: { id: string; name: LocalizedText }[] }>('GET', '/v1/catalog/skills'),
  createGoal: (studentId: string, degreeId: string, targetScore?: number) =>
    req('POST', '/v1/goals', { studentId, degreeId, targetScore }),
  startAssessment: (studentId: string) =>
    req<{ assessmentId: string; question: PublicQuestion; progress: { asked: number } }>(
      'POST',
      '/v1/assessments',
      { studentId },
    ),
  submitResponse: (assessmentId: string, questionId: string, answer?: string, idk?: boolean) =>
    req<
      | { done: false; question: PublicQuestion; progress: { asked: number } }
      | { done: true; stopReason: string; progress: { asked: number } }
    >('POST', `/v1/assessments/${assessmentId}/responses`, { questionId, answer, idk }),
  completeAssessment: (assessmentId: string) =>
    req<DiagnosticResults>('POST', `/v1/assessments/${assessmentId}/complete`),
  getSkills: (studentId: string) =>
    req<{ skills: SkillProfileItem[] }>('GET', `/v1/students/${studentId}/skills`),
  getRecommendations: (studentId: string) =>
    req<{ recommendations: { skillId: string; reasonCodes: string[]; explanation: string }[] }>(
      'GET',
      `/v1/students/${studentId}/recommendations`,
    ),
  getTargetEstimate: (studentId: string) =>
    req<TargetEstimate>('GET', `/v1/students/${studentId}/target-estimate`),
  getPracticeNext: (studentId: string) =>
    req<{ done: true } | { skillId: string; question: PublicQuestion }>(
      'GET',
      `/v1/students/${studentId}/practice/next`,
    ),
  submitPracticeAnswer: (studentId: string, questionId: string, answer?: string, idk?: boolean) =>
    req<{
      correct: boolean;
      outcome: string;
      explanation: LocalizedText;
      skills: ProfileBandItem[];
    }>('POST', '/v1/practice/answer', { studentId, questionId, answer, idk }),
  startSession: (studentId: string) =>
    req<{
      sessionId: string;
      recommendedSkills: string[];
      questions: PublicQuestion[];
      progress: { answered: number; total: number };
    }>('POST', `/v1/students/${studentId}/sessions`),
  submitSessionResponse: (sessionId: string, questionId: string, answer?: string, idk?: boolean) =>
    req<{
      correct: boolean;
      outcome: string;
      explanation: LocalizedText;
      skills: ProfileBandItem[];
      progress: { answered: number };
    }>('POST', `/v1/sessions/${sessionId}/responses`, { questionId, answer, idk }),
  completeSession: (sessionId: string) =>
    req<{ level: { level: number; range: [number, number]; confidence: number }; skills: ProfileBandItem[] }>(
      'POST',
      `/v1/sessions/${sessionId}/complete`,
    ),
};
