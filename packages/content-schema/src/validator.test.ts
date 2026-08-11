import { describe, it, expect } from 'vitest';
import {
  validateSkill,
  validateQuestion,
  validateSkillReferences,
  validateQuestionReferences,
  validateDegree,
} from './validator';
import type { Skill, Question } from './schemas';

describe('Content Validation', () => {
  describe('validateSkill', () => {
    it('should validate a valid skill', () => {
      const data = {
        id: 'mathematics.algebra',
        version: 1,
        subject: 'mathematics-ii',
        region: 'catalunya',
        academic_year: 2026,
        name: { ca: 'Àlgebra', es: 'Álgebra' },
        status: 'published',
      };

      const { skill, errors } = validateSkill(data, 'test.yaml');
      expect(errors).toHaveLength(0);
      expect(skill).toBeDefined();
      expect(skill?.id).toBe('mathematics.algebra');
    });

    it('should reject invalid skill ID', () => {
      const data = {
        id: 'Invalid ID!',
        version: 1,
        subject: 'mathematics-ii',
        region: 'catalunya',
        academic_year: 2026,
        name: { ca: 'Test' },
      };

      const { skill, errors } = validateSkill(data, 'test.yaml');
      expect(errors.length).toBeGreaterThan(0);
      expect(skill).toBeNull();
    });

    it('should validate prerequisites array', () => {
      const data = {
        id: 'mathematics.calculus',
        version: 1,
        subject: 'mathematics-ii',
        region: 'catalunya',
        academic_year: 2026,
        name: { ca: 'Càlcul' },
        prerequisites: ['mathematics.algebra', 'mathematics.functions'],
        status: 'published',
      };

      const { skill, errors } = validateSkill(data, 'test.yaml');
      expect(errors).toHaveLength(0);
      expect(skill?.prerequisites).toEqual(['mathematics.algebra', 'mathematics.functions']);
    });
  });

  describe('validateQuestion', () => {
    it('should validate a valid multiple choice question', () => {
      const data = {
        id: 'mat2-2026-000001',
        version: 1,
        region: 'catalunya',
        academic_year: 2026,
        subject: 'mathematics-ii',
        type: 'multiple_choice',
        skills: ['mathematics.algebra'],
        difficulty: { initial: 0.55 },
        question: { ca: 'Test question?' },
        options: [
          { id: 'A', ca: 'Option A' },
          { id: 'B', ca: 'Option B' },
        ],
        answer: { type: 'single', correct: 'A' },
        explanation: { ca: 'Because...' },
        source: { type: 'official', authority: 'Canal Universitats' },
      };

      const { question, errors } = validateQuestion(data, 'test.yaml');
      expect(errors).toHaveLength(0);
      expect(question?.id).toBe('mat2-2026-000001');
    });

    it('should require skills', () => {
      const data = {
        id: 'mat2-test',
        version: 1,
        region: 'catalunya',
        academic_year: 2026,
        subject: 'mathematics-ii',
        type: 'multiple_choice',
        skills: [],
        difficulty: { initial: 0.55 },
        question: { ca: 'Test?' },
        options: [{ id: 'A', ca: 'A' }],
        answer: { type: 'single', correct: 'A' },
        explanation: { ca: 'Exp' },
        source: { type: 'official' },
      };

      const { question, errors } = validateQuestion(data, 'test.yaml');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateSkillReferences', () => {
    it('should detect missing prerequisites', () => {
      const skills = new Map<string, Skill>([
        [
          'mathematics.calculus',
          {
            id: 'mathematics.calculus',
            version: 1,
            subject: 'mathematics-ii',
            region: 'catalunya' as const,
            academic_year: 2026,
            name: { ca: 'Càlcul' },
            prerequisites: ['mathematics.algebra'],
            status: 'published',
          } as Skill,
        ],
      ]);

      const errors = validateSkillReferences(skills);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Prerequisite skill not found');
    });

    it('should detect circular dependencies', () => {
      const skills = new Map<string, Skill>([
        [
          'mathematics.a',
          {
            id: 'mathematics.a',
            version: 1,
            subject: 'mathematics-ii',
            region: 'catalunya' as const,
            academic_year: 2026,
            name: { ca: 'A' },
            prerequisites: ['mathematics.b'],
            status: 'published',
          } as Skill,
        ],
        [
          'mathematics.b',
          {
            id: 'mathematics.b',
            version: 1,
            subject: 'mathematics-ii',
            region: 'catalunya' as const,
            academic_year: 2026,
            name: { ca: 'B' },
            parent: 'mathematics.a',
            status: 'published',
          } as Skill,
        ],
      ]);

      const errors = validateSkillReferences(skills);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Circular');
    });
  });

  describe('validateQuestionReferences', () => {
    it('should detect missing skill references', () => {
      const skills = new Map<string, Skill>();
      const questions: Question[] = [
        {
          id: 'q1',
          version: 1,
          region: 'catalunya' as const,
          academic_year: 2026,
          subject: 'mathematics-ii',
          type: 'multiple_choice',
          skills: ['nonexistent.skill'],
          difficulty: { initial: 0.5 },
          question: { ca: 'Q?' },
          options: [{ id: 'A', ca: 'A' }],
          answer: { type: 'single', correct: 'A' },
          explanation: { ca: 'E' },
          source: { type: 'official' },
        } as Question,
      ];

      const errors = validateQuestionReferences(questions, skills);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Referenced skill not found');
    });

    it('should detect duplicate question IDs', () => {
      const skills = new Map<string, Skill>([
        [
          'math.algebra',
          {
            id: 'math.algebra',
            version: 1,
            subject: 'mathematics-ii',
            region: 'catalunya' as const,
            academic_year: 2026,
            name: { ca: 'A' },
            status: 'published',
          } as Skill,
        ],
      ]);

      const questions: Question[] = [
        {
          id: 'q1',
          version: 1,
          region: 'catalunya' as const,
          academic_year: 2026,
          subject: 'mathematics-ii',
          type: 'multiple_choice',
          skills: ['math.algebra'],
          difficulty: { initial: 0.5 },
          question: { ca: 'Q1?' },
          options: [{ id: 'A', ca: 'A' }],
          answer: { type: 'single', correct: 'A' },
          explanation: { ca: 'E' },
          source: { type: 'official' },
        } as Question,
        {
          id: 'q1',
          version: 1,
          region: 'catalunya' as const,
          academic_year: 2026,
          subject: 'mathematics-ii',
          type: 'multiple_choice',
          skills: ['math.algebra'],
          difficulty: { initial: 0.5 },
          question: { ca: 'Q2?' },
          options: [{ id: 'A', ca: 'A' }],
          answer: { type: 'single', correct: 'A' },
          explanation: { ca: 'E' },
          source: { type: 'official' },
        } as Question,
      ];

      const errors = validateQuestionReferences(questions, skills);
      expect(errors.some((e) => e.error.includes('Duplicate'))).toBe(true);
    });
  });

  describe('validateDegree', () => {
    it('should validate a valid degree', () => {
      const data = {
        id: 'upc-ingenieria-informatica',
        university_id: 'upc',
        name: {
          ca: 'Enginyeria Informàtica',
          es: 'Ingeniería Informática',
        },
        admission_score_max: 14,
        weightings: [{ subject: 'mathematics-ii', coefficient: 0.2 }],
      };

      const { degree, errors } = validateDegree(data, 'test.yaml');
      expect(errors).toHaveLength(0);
      expect(degree?.id).toBe('upc-ingenieria-informatica');
    });
  });
});
