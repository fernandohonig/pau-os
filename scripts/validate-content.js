#!/usr/bin/env node

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
} from '../packages/content-schema/src/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contentDir = path.join(rootDir, 'content');

function loadYamlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.parse(content);
}

function walkDir(dir, ext, callback) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      walkDir(fullPath, ext, callback);
    } else if (file.name.endsWith(ext)) {
      callback(fullPath);
    }
  }
}

async function validate() {
  console.log('🔍 Validating content...\n');

  const allErrors = [];
  const allWarnings = [];
  const skills = new Map();
  const questions = [];

  // Validate skills
  console.log('📚 Validating skills...');
  walkDir(path.join(contentDir, '**/skills'), '.yaml', (filePath) => {
    const data = loadYamlFile(filePath);
    const { skill, errors } = validateSkill(data, path.relative(contentDir, filePath));

    if (errors.length > 0) {
      allErrors.push(...errors);
    } else if (skill) {
      skills.set(skill.id, skill);
    }
  });

  // Validate questions
  console.log('❓ Validating questions...');
  walkDir(path.join(contentDir, '**/questions'), '.yaml', (filePath) => {
    const data = loadYamlFile(filePath);
    const { question, errors } = validateQuestion(data, path.relative(contentDir, filePath));

    if (errors.length > 0) {
      allErrors.push(...errors);
    } else if (question) {
      questions.push(question);
    }
  });

  // Validate skill references
  console.log('🔗 Validating skill references...');
  const skillRefErrors = validateSkillReferences(skills);
  allErrors.push(...skillRefErrors);

  // Validate question references
  console.log('✅ Validating question references...');
  const questionRefErrors = validateQuestionReferences(questions, skills);
  allErrors.push(...questionRefErrors);

  // Report
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results:`);
  console.log('='.repeat(60));

  console.log(`✓ Skills loaded: ${skills.size}`);
  console.log(`✓ Questions loaded: ${questions.length}`);

  if (allErrors.length > 0) {
    console.log(`\n❌ ERRORS: ${allErrors.length}`);
    for (const err of allErrors.slice(0, 20)) {
      console.log(`   ${err.file}: ${err.error}`);
      if (err.details && typeof err.details === 'string') {
        console.log(`      ${err.details}`);
      }
    }
    if (allErrors.length > 20) {
      console.log(`   ... and ${allErrors.length - 20} more`);
    }
  }

  if (allWarnings.length > 0) {
    console.log(`\n⚠️  WARNINGS: ${allWarnings.length}`);
    for (const warn of allWarnings.slice(0, 10)) {
      console.log(`   ${warn}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  const isValid = allErrors.length === 0;
  console.log(isValid ? '✅ Validation passed' : '❌ Validation failed');

  process.exit(isValid ? 0 : 1);
}

validate().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
