// Typed REST client for the PAU OS API. Base URL and Google client id come from
// Vite env (VITE_API_BASE_URL / VITE_GOOGLE_CLIENT_ID).

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** Google OAuth web client id, if configured (enables the Google button). */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const TOKEN_KEY = 'pau-token';
let authToken: string | null = null;
try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch {
  authToken = null;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
}
export function getAuthToken(): string | null {
  return authToken;
}

export interface AuthResult {
  token: string;
  role: 'student' | 'admin';
  email: string | null;
  studentId: string | null;
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
      subjectLevel: {
        level: number;
        range: [number, number];
        confidence: number;
        assessedSkillCount: number;
      };
      contribution: {
        subject: string;
        coefficient: number;
        points: number;
        range: [number, number];
      } | null;
      cutoff: { score: number; assignment: string; academicYear: number; sourceType: string } | null;
      disclaimer: string;
    };

/** Auth/permission errors carry the HTTP status so the UI can react (e.g. 401). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError((json && json.error) || `request_failed_${res.status}`, res.status);
  return json as T;
}

export interface AdminSummary {
  summary: {
    students: number;
    diagnosticStarted: number;
    diagnosticCompleted: number;
    diagnosticCompletionRate: number;
    avgStudyMinutes: number;
    avgLearningGain: number | null;
    avgLearningGainPerHour: number | null;
    studentsWithGain: number;
  };
  eventCounts: Record<string, number>;
}

/** Full question detail for admin review (correctness visible). */
export interface AdminQuestion {
  id: string;
  version: number;
  type: string;
  skills: string[];
  competencies: string[];
  difficulty: number;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  question: LocalizedText;
  options: Array<{ id: string; ca: string; es?: string }>;
  answer: { type: string; correct: string | string[] };
  explanation: LocalizedText;
  source: {
    type: string;
    authority: string | null;
    examYear: number | null;
    examId: string | null;
    url: string | null;
  };
}

export interface ReviewHistoryItem {
  id: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string | null;
}

export const api = {
  // Auth
  me: () => req<{ role: 'student' | 'admin'; email: string | null; studentId: string | null }>('GET', '/v1/auth/me'),
  devLogin: (role: 'student' | 'admin') => req<AuthResult>('POST', '/v1/auth/dev', { role }),
  googleLogin: (idToken: string, linkStudentId?: string) =>
    req<AuthResult>('POST', '/v1/auth/google', { idToken, linkStudentId }),
  adminSummary: () => req<AdminSummary>('GET', '/v1/admin/metrics/summary'),
  // Content review (admin)
  adminReviews: (status?: string) =>
    req<{ reviews: AdminQuestion[] }>(
      'GET',
      `/v1/admin/reviews${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  adminReview: (id: string) =>
    req<{ question: AdminQuestion; history: ReviewHistoryItem[] }>('GET', `/v1/admin/reviews/${id}`),
  approveReview: (id: string, notes?: string) =>
    req<{ id: string; reviewStatus: string }>('POST', `/v1/admin/reviews/${id}/approve`, { notes }),
  rejectReview: (id: string, notes?: string) =>
    req<{ id: string; reviewStatus: string }>('POST', `/v1/admin/reviews/${id}/reject`, { notes }),

  createStudent: () => req<{ id: string }>('POST', '/v1/students'),
  getDegrees: () => req<{ degrees: Degree[]; provisional: boolean }>('GET', '/v1/catalog/degrees'),
  getSkillCatalog: () =>
    req<{ skills: { id: string; name: LocalizedText }[] }>('GET', '/v1/catalog/skills'),
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
    req<{
      level: { level: number; range: [number, number]; confidence: number };
      skills: ProfileBandItem[];
    }>('POST', `/v1/sessions/${sessionId}/complete`),
};
