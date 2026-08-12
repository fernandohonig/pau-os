/**
 * Materialize workflow-generated + verified Física questions into content YAML.
 * Input: the gen-physics-questions workflow result JSON (its task output file,
 * which has a top-level `result.items`). Output: a validated question array at
 * content/catalunya/2026/physics/questions/generated/generated.yaml.
 *
 * Provenance is `generated` and review status `pending_review` — these land in
 * the admin review queue; nothing is served until a human approves it.
 *
 * Run: tsx scripts/materialize-physics/index.ts <workflow-output.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

interface GenItem {
  stem_ca: string;
  stem_es: string;
  options: Array<{ id: string; ca: string; es: string }>;
  correct: string;
  explanation_ca: string;
  explanation_es: string;
  difficulty: number;
  skillId: string;
}

// Map a skill-id root to its subject, question-id prefix and content folder.
const ROOT_CFG: Record<string, { subject: string; prefix: string; dir: string }> = {
  physics: { subject: 'physics', prefix: 'fis-g', dir: 'physics' },
  chemistry: { subject: 'chemistry', prefix: 'qui-g', dir: 'chemistry' },
  mathematics: { subject: 'mathematics-ii', prefix: 'mat-g', dir: 'mathematics-ii' },
};

const here = path.dirname(fileURLToPath(import.meta.url));

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write('usage: tsx scripts/materialize-physics/index.ts <workflow-output.json>\n');
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const items: GenItem[] = parsed.result?.items ?? parsed.items ?? [];

const root = (items[0]?.skillId ?? '').split('.')[0];
const cfg = ROOT_CFG[root];
if (!cfg) {
  process.stderr.write(`unknown subject root "${root}" (from skillId)\n`);
  process.exit(1);
}
const outDir = path.resolve(here, `../../content/catalunya/2026/${cfg.dir}/questions/generated`);

const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const VALID_IDS = new Set(['A', 'B', 'C', 'D']);

let seq = 0;
let skipped = 0;
const questions = [];
for (const it of items) {
  const optionIds = (it.options ?? []).map((o) => o.id);
  // Sanity gates (the workflow already verified these, but be defensive).
  if (!it.stem_ca || !it.stem_es || it.options?.length !== 4) {
    skipped++;
    continue;
  }
  if (!optionIds.every((id) => VALID_IDS.has(id)) || new Set(optionIds).size !== 4) {
    skipped++;
    continue;
  }
  if (!optionIds.includes(it.correct)) {
    skipped++;
    continue;
  }
  seq += 1;
  const id = `${cfg.prefix}-${String(seq).padStart(6, '0')}`;
  questions.push({
    id,
    version: 1,
    region: 'catalunya',
    academic_year: 2026,
    subject: cfg.subject,
    type: 'multiple_choice',
    skills: [it.skillId],
    competencies: ['reasoning', 'problem_solving'],
    difficulty: { initial: clamp(it.difficulty ?? 0.5) },
    question: { ca: it.stem_ca, es: it.stem_es },
    options: it.options.map((o) => ({ id: o.id, ca: o.ca, es: o.es })),
    answer: { type: 'single', correct: it.correct },
    explanation: { ca: it.explanation_ca, es: it.explanation_es },
    source: {
      type: 'generated',
      authority: 'PAU OS — AI-generated, dual-verified (physics correctness + validity)',
      url: null,
    },
    review: { status: 'pending_review' },
  });
}

fs.mkdirSync(outDir, { recursive: true });
const banner =
  '# Física questions — AI-generated and dual-verified (physics correctness + ' +
  'validity), provenance `generated`, review status `pending_review`.\n' +
  '# They enter the admin review queue; nothing is served until approved.\n' +
  '# Regenerate via the gen-physics-questions workflow + scripts/materialize-physics.\n';
fs.writeFileSync(path.join(outDir, 'generated.yaml'), banner + stringify(questions));

process.stdout.write(`✅ Wrote ${questions.length} questions (skipped ${skipped}).\n`);
