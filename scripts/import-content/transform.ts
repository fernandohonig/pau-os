// Pure transforms: validated content-schema objects -> flat rows matching the
// Prisma models in prisma/schema.prisma. Kept free of any Prisma/DB import so
// they are trivially unit-testable and reusable by the seed CLI.

import type {
  Skill,
  Question,
  Degree,
  Cutoff,
  University,
} from '../../packages/content-schema/src/index.js';

/** Coerce `undefined` to `null` so Prisma writes an explicit NULL. */
function orNull<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

export interface SkillRow {
  id: string;
  version: number;
  subject: string;
  region: string;
  academicYear: number;
  nameCA: string;
  nameES: string | null;
  parent: string | null;
  prerequisites: string[];
  related: string[];
  competencies: string[];
  status: string;
}

export function skillToRow(skill: Skill): SkillRow {
  return {
    id: skill.id,
    version: skill.version,
    subject: skill.subject,
    region: skill.region,
    academicYear: skill.academic_year,
    nameCA: skill.name.ca ?? '',
    nameES: orNull(skill.name.es),
    parent: orNull(skill.parent),
    prerequisites: skill.prerequisites ?? [],
    related: skill.related ?? [],
    competencies: skill.competencies ?? [],
    status: skill.status,
  };
}

export interface QuestionRow {
  id: string;
  version: number;
  region: string;
  academicYear: number;
  subject: string;
  type: string;
  skills: string[];
  competencies: string[];
  difficultyInitial: number;
  difficultyCali: number | null;
  questionCA: string;
  questionES: string | null;
  options: unknown;
  answer: unknown;
  explanation: unknown;
  sourceType: string;
  sourceAuthority: string | null;
  sourceExamYear: number | null;
  sourceExamId: string | null;
  sourceUrl: string | null;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

export function questionToRow(q: Question): QuestionRow {
  return {
    id: q.id,
    version: q.version,
    region: q.region,
    academicYear: q.academic_year,
    subject: q.subject,
    type: q.type,
    skills: q.skills,
    competencies: q.competencies ?? [],
    difficultyInitial: q.difficulty.initial,
    difficultyCali: orNull(q.difficulty.calibrated),
    questionCA: q.question.ca ?? '',
    questionES: orNull(q.question.es),
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    sourceType: q.source.type,
    sourceAuthority: orNull(q.source.authority),
    sourceExamYear: orNull(q.source.exam_year),
    sourceExamId: orNull(q.source.exam_id),
    sourceUrl: q.source.url ? q.source.url : null,
    reviewStatus: q.review.status,
    reviewedBy: orNull(q.review.reviewed_by),
    reviewedAt: q.review.reviewed_at ? new Date(q.review.reviewed_at) : null,
  };
}

export interface DegreeRow {
  id: string;
  universityId: string;
  nameCA: string;
  nameES: string | null;
  admissionScoreMax: number;
  weightings: unknown;
}

export function degreeToRow(degree: Degree): DegreeRow {
  return {
    id: degree.id,
    universityId: degree.university_id,
    nameCA: degree.name.ca ?? '',
    nameES: orNull(degree.name.es),
    admissionScoreMax: degree.admission_score_max,
    weightings: degree.weightings ?? [],
  };
}

export interface CutoffRow {
  degreeId: string;
  academicYear: number;
  assignment: string;
  score: number;
  sourceAuthority: string;
  sourceType: string;
  sourceUrl: string | null;
  retrievedAt: Date;
}

export function cutoffToRow(cutoff: Cutoff): CutoffRow {
  return {
    degreeId: cutoff.degree_id,
    academicYear: cutoff.academic_year,
    assignment: cutoff.assignment,
    score: cutoff.score,
    sourceAuthority: cutoff.source.authority,
    sourceType: cutoff.source.type,
    sourceUrl: cutoff.source.url ? cutoff.source.url : null,
    retrievedAt: new Date(cutoff.source.retrieved_at),
  };
}

export interface UniversityRow {
  id: string;
  nameCA: string;
  nameES: string | null;
  region: string;
}

export function universityToRow(u: University): UniversityRow {
  return {
    id: u.id,
    nameCA: u.name.ca ?? '',
    nameES: orNull(u.name.es),
    region: u.region,
  };
}
