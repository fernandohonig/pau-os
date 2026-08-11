// Shared content loader used by both the validation CLI and the import CLI.
// Walks the content/ tree once, validates every artifact against the Zod
// schemas, and returns typed collections plus any validation errors.

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import {
  validateSkill,
  validateQuestion,
  validateDegree,
  validateCutoff,
  validateUniversity,
  validateSkillReferences,
  validateQuestionReferences,
  type Skill,
  type Question,
  type Degree,
  type Cutoff,
  type University,
  type ValidationError,
} from '../../packages/content-schema/src/index.js';

export interface LoadedContent {
  skills: Map<string, Skill>;
  questions: Question[];
  degrees: Map<string, Degree>;
  cutoffs: Cutoff[];
  universities: Map<string, University>;
  errors: ValidationError[];
}

function walkDir(dir: string, ext: string, cb: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, ext, cb);
    else if (entry.name.endsWith(ext)) cb(full);
  }
}

function asRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data === null || data === undefined) return [];
  return [data];
}

/**
 * Load and validate all content under `contentDir`. Cross-reference checks
 * (skill graph integrity, question->skill references, cutoff->degree
 * references) are included in the returned `errors`.
 */
export function loadContent(contentDir: string): LoadedContent {
  const errors: ValidationError[] = [];
  const skills = new Map<string, Skill>();
  const questions: Question[] = [];
  const degrees = new Map<string, Degree>();
  const cutoffs: Cutoff[] = [];
  const universities = new Map<string, University>();

  const has = (p: string, seg: string): boolean =>
    p.includes(`${path.sep}${seg}${path.sep}`);

  walkDir(contentDir, '.yaml', (filePath) => {
    const rel = path.relative(contentDir, filePath);
    const base = path.basename(filePath);
    const data = yaml.parse(fs.readFileSync(filePath, 'utf8'));

    if (has(rel, 'skills') || base === 'skills.yaml') {
      for (const r of asRecords(data)) {
        const { skill, errors: e } = validateSkill(r, rel);
        if (e.length) errors.push(...e);
        else if (skill) skills.set(skill.id, skill);
      }
    } else if (has(rel, 'questions')) {
      for (const r of asRecords(data)) {
        const { question, errors: e } = validateQuestion(r, rel);
        if (e.length) errors.push(...e);
        else if (question) questions.push(question);
      }
    } else if (has(rel, 'degrees')) {
      for (const r of asRecords(data)) {
        const { degree, errors: e } = validateDegree(r, rel);
        if (e.length) errors.push(...e);
        else if (degree) degrees.set(degree.id, degree);
      }
    } else if (has(rel, 'cutoffs')) {
      for (const r of asRecords(data)) {
        const { cutoff, errors: e } = validateCutoff(r, rel);
        if (e.length) errors.push(...e);
        else if (cutoff) cutoffs.push(cutoff);
      }
    } else if (base === 'universities.yaml') {
      for (const r of asRecords(data)) {
        const { university, errors: e } = validateUniversity(r, rel);
        if (e.length) errors.push(...e);
        else if (university) universities.set(university.id, university);
      }
    }
  });

  errors.push(...validateSkillReferences(skills));
  errors.push(...validateQuestionReferences(questions, skills));

  for (const cutoff of cutoffs) {
    if (degrees.size > 0 && !degrees.has(cutoff.degree_id)) {
      errors.push({
        file: `cutoff:${cutoff.degree_id}`,
        error: `Cutoff references unknown degree: ${cutoff.degree_id}`,
      });
    }
  }

  return { skills, questions, degrees, cutoffs, universities, errors };
}
