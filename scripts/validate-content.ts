#!/usr/bin/env tsx

import path from 'path';
import { fileURLToPath } from 'url';
import { loadContent } from './lib/load-content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentDir = path.resolve(__dirname, '..', 'content');

function main(): void {
  console.info('🔍 Validating content...\n');

  const { skills, questions, degrees, cutoffs, universities, errors } = loadContent(contentDir);

  console.info('='.repeat(60));
  console.info('📊 Results');
  console.info('='.repeat(60));
  console.info(`   Skills:       ${skills.size}`);
  console.info(`   Questions:    ${questions.length}`);
  console.info(`   Degrees:      ${degrees.size}`);
  console.info(`   Cutoffs:      ${cutoffs.length}`);
  console.info(`   Universities: ${universities.size}`);

  if (errors.length > 0) {
    console.error(`\n❌ ERRORS: ${errors.length}`);
    for (const err of errors.slice(0, 30)) {
      console.error(`   ${err.file}: ${err.error}`);
      if (typeof err.details === 'string') {
        console.error(`      ${err.details.split('\n')[0]}`);
      }
    }
    if (errors.length > 30) {
      console.error(`   ... and ${errors.length - 30} more`);
    }
  }

  console.info('\n' + '='.repeat(60));
  const isValid = errors.length === 0;
  console.info(isValid ? '✅ Validation passed' : '❌ Validation failed');

  process.exit(isValid ? 0 : 1);
}

main();
