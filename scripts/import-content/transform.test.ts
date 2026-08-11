import { describe, it, expect } from 'vitest';
import { skillToRow, questionToRow, degreeToRow, cutoffToRow, universityToRow } from './transform';
import type { Skill, Question, Degree, Cutoff, University } from '../../packages/content-schema/src/index';

describe('content transforms', () => {
  it('maps a skill to a flat row, normalizing optional fields to null', () => {
    const skill = {
      id: 'mathematics.calculus.derivatives',
      version: 1,
      subject: 'mathematics-ii',
      region: 'catalunya',
      academic_year: 2026,
      name: { ca: 'Derivades' },
      prerequisites: ['mathematics.analysis.continuity'],
      related: [],
      competencies: ['reasoning'],
      status: 'published',
    } as unknown as Skill;

    const row = skillToRow(skill);
    expect(row.id).toBe('mathematics.calculus.derivatives');
    expect(row.academicYear).toBe(2026);
    expect(row.nameCA).toBe('Derivades');
    expect(row.nameES).toBeNull();
    expect(row.parent).toBeNull();
    expect(row.prerequisites).toEqual(['mathematics.analysis.continuity']);
  });

  it('maps a question, preserving JSON blobs and parsing reviewedAt', () => {
    const q = {
      id: 'mat2-c-000001',
      version: 1,
      region: 'catalunya',
      academic_year: 2026,
      subject: 'mathematics-ii',
      type: 'multiple_choice',
      skills: ['mathematics.algebra.polynomials'],
      competencies: ['reasoning'],
      difficulty: { initial: 0.35, calibrated: null },
      question: { ca: 'Factoritza x² - 5x + 6' },
      options: [{ id: 'A', ca: '(x-2)(x-3)' }],
      answer: { type: 'single', correct: 'A' },
      explanation: { ca: '...' },
      source: { type: 'community', authority: 'PAU OS', url: null },
      review: { status: 'pending_review', reviewed_by: null, reviewed_at: null },
    } as unknown as Question;

    const row = questionToRow(q);
    expect(row.difficultyInitial).toBe(0.35);
    expect(row.difficultyCali).toBeNull();
    expect(row.sourceType).toBe('community');
    expect(row.sourceUrl).toBeNull();
    expect(row.reviewedAt).toBeNull();
    expect(Array.isArray(row.options)).toBe(true);
  });

  it('parses a reviewedAt ISO string into a Date', () => {
    const q = {
      id: 'q',
      version: 1,
      region: 'catalunya',
      academic_year: 2026,
      subject: 'mathematics-ii',
      type: 'multiple_choice',
      skills: ['s'],
      competencies: [],
      difficulty: { initial: 0.5 },
      question: { ca: 'x' },
      options: [{ id: 'A', ca: 'a' }],
      answer: { type: 'single', correct: 'A' },
      explanation: { ca: 'e' },
      source: { type: 'community' },
      review: { status: 'approved', reviewed_at: '2026-01-15T10:00:00.000Z' },
    } as unknown as Question;

    const row = questionToRow(q);
    expect(row.reviewedAt).toBeInstanceOf(Date);
    expect(row.reviewedAt?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('maps a degree with weightings preserved as JSON', () => {
    const degree = {
      id: 'upc-ingenieria-informatica',
      university_id: 'upc',
      name: { ca: 'Enginyeria Informàtica', es: 'Ingeniería Informática' },
      admission_score_max: 14,
      weightings: [{ subject: 'mathematics-ii', coefficient: 0.2 }],
    } as unknown as Degree;

    const row = degreeToRow(degree);
    expect(row.universityId).toBe('upc');
    expect(row.admissionScoreMax).toBe(14);
    expect(row.weightings).toEqual([{ subject: 'mathematics-ii', coefficient: 0.2 }]);
  });

  it('maps a cutoff, parsing retrievedAt', () => {
    const cutoff = {
      degree_id: 'upc-ingenieria-informatica',
      academic_year: 2026,
      assignment: 'first',
      score: 12.34,
      source: {
        authority: 'Canal Universitats',
        type: 'official',
        retrieved_at: '2026-07-01T00:00:00.000Z',
      },
    } as unknown as Cutoff;

    const row = cutoffToRow(cutoff);
    expect(row.score).toBe(12.34);
    expect(row.retrievedAt).toBeInstanceOf(Date);
    expect(row.sourceType).toBe('official');
  });

  it('maps a university', () => {
    const u = {
      id: 'upc',
      name: { ca: 'Universitat Politècnica de Catalunya' },
      region: 'catalunya',
    } as unknown as University;

    const row = universityToRow(u);
    expect(row.id).toBe('upc');
    expect(row.nameES).toBeNull();
    expect(row.region).toBe('catalunya');
  });
});
