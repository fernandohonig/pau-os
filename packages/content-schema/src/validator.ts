import {
  SkillSchema,
  QuestionSchema,
  DegreeSchema,
  CutoffSchema,
  UniversitySchema,
  type Skill,
  type Question,
  type Degree,
  type Cutoff,
  type University,
} from './schemas';

export interface ValidationError {
  file: string;
  error: string;
  details?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export function validateSkill(data: unknown, file: string): { skill: Skill | null; errors: ValidationError[] } {
  try {
    const skill = SkillSchema.parse(data);
    return { skill, errors: [] };
  } catch (error: unknown) {
    return {
      skill: null,
      errors: [
        {
          file,
          error: `Invalid skill schema`,
          details: error instanceof Error ? error.message : error,
        },
      ],
    };
  }
}

export function validateQuestion(data: unknown, file: string): { question: Question | null; errors: ValidationError[] } {
  try {
    const question = QuestionSchema.parse(data);
    return { question, errors: [] };
  } catch (error: unknown) {
    return {
      question: null,
      errors: [
        {
          file,
          error: `Invalid question schema`,
          details: error instanceof Error ? error.message : error,
        },
      ],
    };
  }
}

export function validateDegree(data: unknown, file: string): { degree: Degree | null; errors: ValidationError[] } {
  try {
    const degree = DegreeSchema.parse(data);
    return { degree, errors: [] };
  } catch (error: unknown) {
    return {
      degree: null,
      errors: [
        {
          file,
          error: `Invalid degree schema`,
          details: error instanceof Error ? error.message : error,
        },
      ],
    };
  }
}

export function validateCutoff(data: unknown, file: string): { cutoff: Cutoff | null; errors: ValidationError[] } {
  try {
    const cutoff = CutoffSchema.parse(data);
    return { cutoff, errors: [] };
  } catch (error: unknown) {
    return {
      cutoff: null,
      errors: [
        {
          file,
          error: `Invalid cutoff schema`,
          details: error instanceof Error ? error.message : error,
        },
      ],
    };
  }
}

export function validateUniversity(data: unknown, file: string): { university: University | null; errors: ValidationError[] } {
  try {
    const university = UniversitySchema.parse(data);
    return { university, errors: [] };
  } catch (error: unknown) {
    return {
      university: null,
      errors: [
        {
          file,
          error: `Invalid university schema`,
          details: error instanceof Error ? error.message : error,
        },
      ],
    };
  }
}

export function validateSkillReferences(skills: Map<string, Skill>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [_id, skill] of skills) {
    // Check parent exists
    if (skill.parent && !skills.has(skill.parent)) {
      errors.push({
        file: skill.id,
        error: `Parent skill not found: ${skill.parent}`,
      });
    }

    // Check prerequisites exist
    for (const prereq of skill.prerequisites || []) {
      if (!skills.has(prereq)) {
        errors.push({
          file: skill.id,
          error: `Prerequisite skill not found: ${prereq}`,
        });
      }
    }

    // Check no circular dependencies
    if (skill.parent && wouldCreateCycle(skill.id, skill.parent, skills)) {
      errors.push({
        file: skill.id,
        error: `Circular prerequisite detected`,
      });
    }
  }

  return errors;
}

function wouldCreateCycle(skillId: string, targetId: string, skills: Map<string, Skill>): boolean {
  const visited = new Set<string>();
  const stack = [targetId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === skillId) return true;
    if (visited.has(current)) continue;

    visited.add(current);
    const skill = skills.get(current);
    if (skill?.parent) stack.push(skill.parent);
    if (skill?.prerequisites) stack.push(...skill.prerequisites);
  }

  return false;
}

export function validateQuestionReferences(questions: Question[], skills: Map<string, Skill>): ValidationError[] {
  const errors: ValidationError[] = [];
  const questionIds = new Set<string>();

  for (const q of questions) {
    // Check unique ID
    if (questionIds.has(q.id)) {
      errors.push({
        file: q.id,
        error: `Duplicate question ID`,
      });
    }
    questionIds.add(q.id);

    // Check skills exist
    for (const skillId of q.skills) {
      if (!skills.has(skillId)) {
        errors.push({
          file: q.id,
          error: `Referenced skill not found: ${skillId}`,
        });
      }
    }

    // Check answer validity
    if (q.type === 'multiple_choice') {
      const validOptions = new Set(q.options.map((o) => o.id));
      if (Array.isArray(q.answer.correct)) {
        for (const correctId of q.answer.correct) {
          if (!validOptions.has(correctId)) {
            errors.push({
              file: q.id,
              error: `Invalid answer option: ${correctId}`,
            });
          }
        }
      } else if (!validOptions.has(q.answer.correct)) {
        errors.push({
          file: q.id,
          error: `Invalid answer option: ${q.answer.correct}`,
        });
      }
    }
  }

  return errors;
}
