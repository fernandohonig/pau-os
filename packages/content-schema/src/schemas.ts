import { z } from 'zod';

// Enums
export const RegionEnum = z.enum(['catalunya']);
export const LanguageEnum = z.enum(['ca', 'es']);
export const SkillStatusEnum = z.enum(['draft', 'published', 'deprecated']);
export const QuestionTypeEnum = z.enum(['multiple_choice', 'free_response', 'short_answer']);
export const ProvanceTypeEnum = z.enum(['official', 'community', 'generated', 'adapted']);
export const ReviewStatusEnum = z.enum(['draft', 'automated_validation', 'pending_review', 'approved', 'rejected', 'published']);
export const CompetencyEnum = z.enum(['reasoning', 'problem_solving', 'communication', 'critical_thinking']);
export const DifficultyEnum = z.enum(['easy', 'medium', 'hard']);

// Localization
export const LocalizedStringSchema = z.record(LanguageEnum, z.string());

// Skill
export const SkillSchema = z.object({
  id: z.string().regex(/^[a-z0-9_.]+$/),
  version: z.number().int().positive(),
  subject: z.string(),
  region: RegionEnum,
  academic_year: z.number().int(),

  name: LocalizedStringSchema,
  description: LocalizedStringSchema.optional(),

  parent: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),

  competencies: z.array(CompetencyEnum).default([]),

  status: SkillStatusEnum.default('draft'),
});

export type Skill = z.infer<typeof SkillSchema>;

// Question
export const QuestionOptionSchema = z.object({
  id: z.string().regex(/^[A-D]$/),
  ca: z.string(),
  es: z.string().optional(),
});

export const QuestionAnswerSchema = z.object({
  type: z.enum(['single', 'multiple']),
  correct: z.union([z.string(), z.array(z.string())]),
});

export const QuestionSourceSchema = z.object({
  type: ProvanceTypeEnum,
  authority: z.string().optional(),
  exam_year: z.number().int().optional(),
  exam_id: z.string().optional(),
  url: z.string().url().optional(),
});

export const QuestionReviewSchema = z.object({
  status: ReviewStatusEnum.default('draft'),
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),

  region: RegionEnum,
  academic_year: z.number().int(),
  subject: z.string(),

  type: QuestionTypeEnum,
  skills: z.array(z.string()).nonempty(),
  competencies: z.array(CompetencyEnum).default([]),

  difficulty: z.object({
    initial: z.number().min(0).max(1),
    calibrated: z.number().min(0).max(1).optional(),
  }),

  question: LocalizedStringSchema,
  options: z.array(QuestionOptionSchema),

  answer: QuestionAnswerSchema,
  explanation: LocalizedStringSchema,

  source: QuestionSourceSchema,
  review: QuestionReviewSchema.default({}),
});

export type Question = z.infer<typeof QuestionSchema>;

// University / Degree
export const WeightingSchema = z.object({
  subject: z.string(),
  coefficient: z.number().min(0).max(1),
});

export const DegreeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  university_id: z.string(),

  name: LocalizedStringSchema,
  description: LocalizedStringSchema.optional(),

  admission_score_max: z.number().positive(),
  weightings: z.array(WeightingSchema).default([]),
});

export type Degree = z.infer<typeof DegreeSchema>;

export const CutoffSchema = z.object({
  degree_id: z.string(),
  academic_year: z.number().int(),
  assignment: z.enum(['first', 'extraordinary', 'historical']).default('first'),
  score: z.number().min(0),

  source: z.object({
    authority: z.string(),
    type: z.enum(['official', 'estimated', 'historical']),
    retrieved_at: z.string().datetime(),
    url: z.string().url().optional(),
  }),
});

export type Cutoff = z.infer<typeof CutoffSchema>;

export const UniversitySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: LocalizedStringSchema,
  region: RegionEnum,
});

export type University = z.infer<typeof UniversitySchema>;
