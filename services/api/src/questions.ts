import type { QuestionMeta } from '@pau/assessment';
import type { Outcome } from '@pau/scoring';
import type { Db } from './prisma.js';

const SUBJECT = 'mathematics-ii';
const REGION = 'catalunya';

// Only admin-approved content is served to students. Everything else stays out
// of diagnostics/practice until a reviewer approves it (spec §17). Review state
// is DB-authoritative — see the content importer.
export const USABLE_REVIEW_STATES = ['approved', 'published'];

// States awaiting a review decision — the admin review queue.
export const REVIEW_QUEUE_STATES = ['draft', 'automated_validation', 'pending_review'];

export interface QuestionRow {
  id: string;
  type: string;
  skills: string[];
  difficultyInitial: number;
  difficultyCali: number | null;
  questionCA: string;
  questionES: string | null;
  options: unknown;
  answer: unknown;
  explanation: unknown;
  sourceType: string;
}

/** Public question shape sent to clients — never includes answer/explanation. */
export interface PublicQuestion {
  id: string;
  type: string;
  skills: string[];
  difficulty: number;
  question: { ca: string; es?: string };
  options: Array<{ id: string; ca: string; es?: string }>;
}

export function effectiveDifficulty(row: { difficultyInitial: number; difficultyCali: number | null }): number {
  return row.difficultyCali ?? row.difficultyInitial;
}

export function toQuestionMeta(row: QuestionRow): QuestionMeta {
  return { id: row.id, skills: row.skills, difficulty: effectiveDifficulty(row) };
}

export function toPublicQuestion(row: QuestionRow): PublicQuestion {
  const options = Array.isArray(row.options)
    ? (row.options as Array<{ id: string; ca: string; es?: string }>).map((o) => ({
        id: o.id,
        ca: o.ca,
        es: o.es,
      }))
    : [];
  return {
    id: row.id,
    type: row.type,
    skills: row.skills,
    difficulty: effectiveDifficulty(row),
    question: { ca: row.questionCA, es: row.questionES ?? undefined },
    options,
  };
}

/** Determine the outcome of an answer without exposing correctness to callers. */
export function outcomeFor(row: QuestionRow, answer: string | undefined, idk: boolean): Outcome {
  if (idk) return 'idk';
  const spec = row.answer as { type: string; correct: string | string[] };
  const correct = spec.correct;
  const isCorrect = Array.isArray(correct)
    ? Array.isArray(answer)
      ? false // multiple-answer submission shape not supported yet
      : correct.length === 1 && correct[0] === answer
    : answer === correct;
  return isCorrect ? 'correct' : 'incorrect';
}

/** Load the usable question bank for the MVP subject/region. */
export async function loadQuestionBank(db: Db): Promise<QuestionRow[]> {
  return db.question.findMany({
    where: { subject: SUBJECT, region: REGION, reviewStatus: { in: USABLE_REVIEW_STATES } },
    select: {
      id: true,
      type: true,
      skills: true,
      difficultyInitial: true,
      difficultyCali: true,
      questionCA: true,
      questionES: true,
      options: true,
      answer: true,
      explanation: true,
      sourceType: true,
    },
  }) as unknown as Promise<QuestionRow[]>;
}

/** Full question row for admin review — includes answer, explanation, review
 *  metadata and provenance (unlike the public shape). */
export interface AdminQuestionRow extends QuestionRow {
  version: number;
  academicYear: number;
  competencies: string[];
  questionES: string | null;
  sourceAuthority: string | null;
  sourceExamYear: number | null;
  sourceExamId: string | null;
  sourceUrl: string | null;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

/** Admin-facing question DTO — full detail, correctness visible. */
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
  answer: unknown;
  explanation: LocalizedText;
  source: {
    type: string;
    authority: string | null;
    examYear: number | null;
    examId: string | null;
    url: string | null;
  };
}

const ADMIN_QUESTION_SELECT = {
  id: true,
  version: true,
  academicYear: true,
  type: true,
  skills: true,
  competencies: true,
  difficultyInitial: true,
  difficultyCali: true,
  questionCA: true,
  questionES: true,
  options: true,
  answer: true,
  explanation: true,
  sourceType: true,
  sourceAuthority: true,
  sourceExamYear: true,
  sourceExamId: true,
  sourceUrl: true,
  reviewStatus: true,
  reviewedBy: true,
  reviewedAt: true,
} as const;

export function toAdminQuestion(row: AdminQuestionRow): AdminQuestion {
  const options = Array.isArray(row.options)
    ? (row.options as Array<{ id: string; ca: string; es?: string }>)
    : [];
  const e = (row.explanation ?? {}) as { ca?: string; es?: string };
  return {
    id: row.id,
    version: row.version,
    type: row.type,
    skills: row.skills,
    competencies: row.competencies,
    difficulty: effectiveDifficulty(row),
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    question: { ca: row.questionCA, es: row.questionES ?? undefined },
    options: options.map((o) => ({ id: o.id, ca: o.ca, es: o.es })),
    answer: row.answer,
    explanation: { ca: e.ca ?? '', es: e.es },
    source: {
      type: row.sourceType,
      authority: row.sourceAuthority,
      examYear: row.sourceExamYear,
      examId: row.sourceExamId,
      url: row.sourceUrl,
    },
  };
}

/** Load questions awaiting review (or a specific set of review states). */
export async function loadReviewQueue(
  db: Db,
  statuses: string[] = REVIEW_QUEUE_STATES,
): Promise<AdminQuestionRow[]> {
  return db.question.findMany({
    where: { subject: SUBJECT, region: REGION, reviewStatus: { in: statuses } },
    orderBy: { updatedAt: 'desc' },
    select: ADMIN_QUESTION_SELECT,
  }) as unknown as Promise<AdminQuestionRow[]>;
}

/** Load a single question with full review detail, or null if absent. */
export async function getQuestionForReview(
  db: Db,
  id: string,
): Promise<AdminQuestionRow | null> {
  return db.question.findUnique({
    where: { id },
    select: ADMIN_QUESTION_SELECT,
  }) as unknown as Promise<AdminQuestionRow | null>;
}

export interface LocalizedText {
  ca: string;
  es?: string;
}

/** Localized explanation for a question (revealed only in practice, not diagnostic). */
export function explanationOf(row: QuestionRow): LocalizedText {
  const e = (row.explanation ?? {}) as { ca?: string; es?: string };
  return { ca: e.ca ?? '', es: e.es };
}
