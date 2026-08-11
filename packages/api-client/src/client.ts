import type {
  Student,
  AssessmentStart,
  ResponseResult,
  DiagnosticResults,
  SkillProfileItem,
  Recommendation,
  Degree,
  Goal,
  PublicQuestion,
  PracticeNext,
  PracticeAnswerResult,
} from './types.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? `${status} ${code}`);
    this.name = 'ApiError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PauClientOptions {
  baseUrl: string;
  /** Injectable fetch (defaults to global fetch); useful for tests/RN. */
  fetch?: FetchLike;
}

/**
 * Typed client for the PAU OS diagnostic API. Works anywhere `fetch` exists
 * (Node 18+, browsers, React Native).
 */
export class PauClient {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;

  constructor(opts: PauClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    const injected = opts.fetch;
    if (injected) {
      this.doFetch = injected;
    } else if (typeof fetch !== 'undefined') {
      this.doFetch = (input, init) => fetch(input, init);
    } else {
      throw new Error('No fetch implementation available; pass opts.fetch.');
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new ApiError(res.status, (json && json.error) || 'request_failed');
    }
    return json as T;
  }

  // Students
  createStudent(): Promise<Student> {
    return this.request<Student>('POST', '/v1/students');
  }
  getStudent(id: string): Promise<Student> {
    return this.request<Student>('GET', `/v1/students/${id}`);
  }
  getSkills(id: string): Promise<{ skills: SkillProfileItem[] }> {
    return this.request('GET', `/v1/students/${id}/skills`);
  }
  getRecommendations(id: string): Promise<{ recommendations: (Recommendation & { id: string })[] }> {
    return this.request('GET', `/v1/students/${id}/recommendations`);
  }
  getCurrentGoal(id: string): Promise<{ goal: Goal | null }> {
    return this.request('GET', `/v1/students/${id}/goal`);
  }

  // Catalog & goals
  getDegrees(): Promise<{ degrees: Degree[]; provisional: boolean }> {
    return this.request('GET', '/v1/catalog/degrees');
  }
  createGoal(input: { studentId: string; degreeId: string; targetScore?: number }): Promise<{ goal: Goal }> {
    return this.request('POST', '/v1/goals', input);
  }
  getGoal(id: string): Promise<{ goal: Goal }> {
    return this.request('GET', `/v1/goals/${id}`);
  }
  updateGoal(id: string, targetScore: number | null): Promise<{ goal: Goal }> {
    return this.request('PATCH', `/v1/goals/${id}`, { targetScore });
  }

  // Diagnostic
  startAssessment(studentId: string): Promise<AssessmentStart> {
    return this.request('POST', '/v1/assessments', { studentId });
  }
  submitResponse(
    assessmentId: string,
    input: { questionId: string; answer?: string; idk?: boolean },
  ): Promise<ResponseResult> {
    return this.request('POST', `/v1/assessments/${assessmentId}/responses`, input);
  }
  completeAssessment(assessmentId: string): Promise<DiagnosticResults> {
    return this.request('POST', `/v1/assessments/${assessmentId}/complete`);
  }
  getQuestion(id: string): Promise<PublicQuestion> {
    return this.request('GET', `/v1/questions/${id}`);
  }

  // Practice
  getPracticeNext(studentId: string): Promise<PracticeNext> {
    return this.request('GET', `/v1/students/${studentId}/practice/next`);
  }
  submitPracticeAnswer(input: {
    studentId: string;
    questionId: string;
    answer?: string;
    idk?: boolean;
  }): Promise<PracticeAnswerResult> {
    return this.request('POST', '/v1/practice/answer', input);
  }
}
