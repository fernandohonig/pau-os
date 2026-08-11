#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
} from '../packages/content-schema/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contentDir = path.join(rootDir, 'content');

function loadYamlFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.parse(content);
}

/**
 * Recursively walk a directory, invoking `callback` for every file whose
 * name matches `ext`. Missing directories are skipped silently.
 */
function walkDir(dir: string, ext: string, callback: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, ext, callback);
    } else if (entry.name.endsWith(ext)) {
      callback(fullPath);
    }
  }
}

/**
 * A content file may hold a single object or an array of objects. Normalize to
 * an array so callers can validate each entry uniformly.
 */
function asRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data === null || data === undefined) return [];
  return [data];
}

/** Heuristic: is this file a skills definition? */
function isSkillFile(filePath: string): boolean {
  const rel = path.relative(contentDir, filePath);
  return rel.includes(`${path.sep}skills${path.sep}`) || path.basename(filePath) === 'skills.yaml';
}

/** Heuristic: is this file a question definition? */
function isQuestionFile(filePath: string): boolean {
  const rel = path.relative(contentDir, filePath);
  return rel.includes(`${path.sep}questions${path.sep}`);
}

/** Heuristic: is this file a degree definition? */
function isDegreeFile(filePath: string): boolean {
  const rel = path.relative(contentDir, filePath);
  return rel.includes(`${path.sep}degrees${path.sep}`);
}

/** Heuristic: is this file a cutoff definition? */
function isCutoffFile(filePath: string): boolean {
  const rel = path.relative(contentDir, filePath);
  return rel.includes(`${path.sep}cutoffs${path.sep}`);
}

/** Heuristic: is this file a universities definition? */
function isUniversityFile(filePath: string): boolean {
  return path.basename(filePath) === 'universities.yaml';
}

async function validate(): Promise<void> {
  console.info('🔍 Validating content...\n');

  const allErrors: ValidationError[] = [];
  const skills = new Map<string, Skill>();
  const questions: Question[] = [];
  const degrees = new Map<string, Degree>();
  const cutoffs: Cutoff[] = [];
  const universities = new Map<string, University>();

  // Walk every YAML file under content/ once and dispatch by location.
  walkDir(contentDir, '.yaml', (filePath) => {
    const rel = path.relative(contentDir, filePath);
    const data = loadYamlFile(filePath);

    if (isSkillFile(filePath)) {
      for (const record of asRecords(data)) {
        const { skill, errors } = validateSkill(record, rel);
        if (errors.length > 0) allErrors.push(...errors);
        else if (skill) skills.set(skill.id, skill);
      }
    } else if (isQuestionFile(filePath)) {
      for (const record of asRecords(data)) {
        const { question, errors } = validateQuestion(record, rel);
        if (errors.length > 0) allErrors.push(...errors);
        else if (question) questions.push(question);
      }
    } else if (isDegreeFile(filePath)) {
      for (const record of asRecords(data)) {
        const { degree, errors } = validateDegree(record, rel);
        if (errors.length > 0) allErrors.push(...errors);
        else if (degree) degrees.set(degree.id, degree);
      }
    } else if (isCutoffFile(filePath)) {
      for (const record of asRecords(data)) {
        const { cutoff, errors } = validateCutoff(record, rel);
        if (errors.length > 0) allErrors.push(...errors);
        else if (cutoff) cutoffs.push(cutoff);
      }
    } else if (isUniversityFile(filePath)) {
      for (const record of asRecords(data)) {
        const { university, errors } = validateUniversity(record, rel);
        if (errors.length > 0) allErrors.push(...errors);
        else if (university) universities.set(university.id, university);
      }
    }
  });

  // Cross-reference checks.
  console.info('🔗 Validating skill references...');
  allErrors.push(...validateSkillReferences(skills));

  console.info('✅ Validating question references...');
  allErrors.push(...validateQuestionReferences(questions, skills));

  // Cutoffs must reference known degrees.
  for (const cutoff of cutoffs) {
    if (degrees.size > 0 && !degrees.has(cutoff.degree_id)) {
      allErrors.push({
        file: `cutoff:${cutoff.degree_id}`,
        error: `Cutoff references unknown degree: ${cutoff.degree_id}`,
      });
    }
  }

  // Report.
  console.info('\n' + '='.repeat(60));
  console.info('📊 Results');
  console.info('='.repeat(60));
  console.info(`   Skills:       ${skills.size}`);
  console.info(`   Questions:    ${questions.length}`);
  console.info(`   Degrees:      ${degrees.size}`);
  console.info(`   Cutoffs:      ${cutoffs.length}`);
  console.info(`   Universities: ${universities.size}`);

  if (allErrors.length > 0) {
    console.error(`\n❌ ERRORS: ${allErrors.length}`);
    for (const err of allErrors.slice(0, 30)) {
      console.error(`   ${err.file}: ${err.error}`);
      if (typeof err.details === 'string') {
        console.error(`      ${err.details.split('\n')[0]}`);
      }
    }
    if (allErrors.length > 30) {
      console.error(`   ... and ${allErrors.length - 30} more`);
    }
  }

  console.info('\n' + '='.repeat(60));
  const isValid = allErrors.length === 0;
  console.info(isValid ? '✅ Validation passed' : '❌ Validation failed');

  process.exit(isValid ? 0 : 1);
}

validate().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
