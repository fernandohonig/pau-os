#!/usr/bin/env tsx
//
// Import validated Git content into PostgreSQL. Content in Git is the source
// of truth (spec §15); this seeds/refreshes the operational read tables.
//
// Usage:
//   DATABASE_URL=... pnpm tsx scripts/import-content/index.ts
//
// Requires a generated Prisma client and a migrated database:
//   pnpm prisma generate && pnpm db:migrate
//
// The Prisma client is imported lazily so that unit tests and type-checking of
// the pure transforms do not require a generated client or a live database.

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadContent } from '../lib/load-content.js';
import { PrismaClient } from '../../prisma/generated/client/client.js';
import {
  skillToRow,
  questionToRow,
  degreeToRow,
  cutoffToRow,
  universityToRow,
} from './transform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentDir = path.resolve(__dirname, '..', '..', 'content');

async function main(): Promise<void> {
  console.info('📥 Importing content into PostgreSQL...\n');

  const content = loadContent(contentDir);
  if (content.errors.length > 0) {
    console.error(`❌ Refusing to import: ${content.errors.length} validation error(s).`);
    for (const e of content.errors.slice(0, 20)) {
      console.error(`   ${e.file}: ${e.error}`);
    }
    console.error('\nRun `pnpm validate-content` and fix the content first.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set. Configure it in .env before importing.');
    process.exit(1);
  }

  // Prisma 7: instantiate the client with a PostgreSQL driver adapter.
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    let skillCount = 0;
    for (const skill of content.skills.values()) {
      const row = skillToRow(skill);
      await prisma.skill.upsert({ where: { id: row.id }, create: row, update: row });
      skillCount++;
    }

    let questionCount = 0;
    for (const question of content.questions) {
      const row = questionToRow(question);
      // Review state is DB-authoritative: new questions enter the review queue
      // as `pending_review`; existing rows keep whatever the admin decided
      // (update omits the review columns). JSON columns need `as never` because
      // Prisma types them per-model.
      await prisma.question.upsert({
        where: { id: row.id },
        create: { ...row, reviewStatus: 'pending_review', reviewedBy: null, reviewedAt: null } as never,
        update: row as never,
      });
      questionCount++;
    }

    let universityCount = 0;
    for (const university of content.universities.values()) {
      const row = universityToRow(university);
      await prisma.university.upsert({ where: { id: row.id }, create: row, update: row });
      universityCount++;
    }

    let degreeCount = 0;
    for (const degree of content.degrees.values()) {
      const row = degreeToRow(degree);
      await prisma.degree.upsert({
        where: { id: row.id },
        create: row as never,
        update: row as never,
      });
      degreeCount++;
    }

    let cutoffCount = 0;
    for (const cutoff of content.cutoffs) {
      const row = cutoffToRow(cutoff);
      await prisma.cutoff.upsert({
        where: {
          degreeId_academicYear_assignment: {
            degreeId: row.degreeId,
            academicYear: row.academicYear,
            assignment: row.assignment,
          },
        },
        create: row,
        update: row,
      });
      cutoffCount++;
    }

    console.info('✅ Import complete:');
    console.info(`   Skills:       ${skillCount}`);
    console.info(`   Questions:    ${questionCount}`);
    console.info(`   Universities: ${universityCount}`);
    console.info(`   Degrees:      ${degreeCount}`);
    console.info(`   Cutoffs:      ${cutoffCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
