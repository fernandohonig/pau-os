import type { QuestionMeta } from '@pau/assessment';
import type { Outcome } from '@pau/scoring';
import type { Db } from './prisma.js';

const SUBJECT = 'mathematics-ii';
const REGION = 'catalunya';

// Reviewed states usable in a diagnostic. `draft`/`rejected` are excluded.
const USABLE_REVIEW_STATES = ['approved', 'published', 'pending_review'];

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
    },
  }) as unknown as Promise<QuestionRow[]>;
}
