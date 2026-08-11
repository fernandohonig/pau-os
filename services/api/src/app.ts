import Fastify, { type FastifyInstance } from 'fastify';
import {
  selectNextQuestion,
  evaluateStop,
  DEFAULT_DIAGNOSTIC_CONFIG,
  type QuestionMeta,
} from '@pau/assessment';
import { updateMastery, INITIAL_MASTERY, masteryBand, type MasteryState } from '@pau/scoring';
import { estimateLevel, topGaps, topStrengths, recommendFromGaps } from '@pau/knowledge-model';
import type { Db } from './prisma.js';
import { recordEvent } from './analytics.js';
import {
  loadQuestionBank,
  toQuestionMeta,
  toPublicQuestion,
  outcomeFor,
  effectiveDifficulty,
  type QuestionRow,
} from './questions.js';

interface SkillStateRow {
  skillId: string;
  masteryProbability: number;
  confidence: number;
  evidenceCount: number;
  streak: number;
}

async function loadSkillStateRows(db: Db, studentId: string): Promise<Map<string, SkillStateRow>> {
  const rows = await db.studentSkillState.findMany({
    where: { studentId },
    select: { skillId: true, masteryProbability: true, confidence: true, evidenceCount: true, streak: true },
  });
  const map = new Map<string, SkillStateRow>();
  for (const r of rows as SkillStateRow[]) map.set(r.skillId, r);
  return map;
}

function toMasteryState(row: SkillStateRow | undefined): MasteryState {
  if (!row) return INITIAL_MASTERY;
  return {
    masteryProbability: row.masteryProbability,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
  };
}

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  // --- Students -----------------------------------------------------------
  // Anonymous student creation (no auth required for the first diagnostic).
  app.post('/v1/students', async (_req, reply) => {
    const student = await db.student.create({ data: {} });
    return reply.code(201).send({ id: student.id });
  });

  app.get<{ Params: { id: string } }>('/v1/students/:id', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });
    return { id: student.id, createdAt: student.createdAt };
  });

  // Skill profile — user-facing bands only, never raw probabilities.
  app.get<{ Params: { id: string } }>('/v1/students/:id/skills', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const rows = await loadSkillStateRows(db, req.params.id);
    const skills = [...rows.values()].map((r) => ({
      skillId: r.skillId,
      band: masteryBand(toMasteryState(r)),
      confidence: Math.round(r.confidence * 100) / 100,
      evidenceCount: r.evidenceCount,
    }));
    return { skills };
  });

  // --- Assessments (diagnostic) ------------------------------------------
  app.post<{ Body: { studentId?: string } }>('/v1/assessments', async (req, reply) => {
    const studentId = req.body?.studentId;
    if (!studentId) return reply.code(400).send({ error: 'studentId_required' });

    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const bank = await loadQuestionBank(db);
    if (bank.length === 0) return reply.code(503).send({ error: 'no_questions_available' });

    const assessment = await db.assessment.create({
      data: { studentId, type: 'diagnostic', status: 'in_progress' },
    });
    await recordEvent(db, 'diagnostic_started', studentId, { assessmentId: assessment.id });

    const states = await loadSkillStateRows(db, studentId);
    const stateMap = new Map<string, MasteryState>();
    for (const [id, r] of states) stateMap.set(id, toMasteryState(r));

    const metas: QuestionMeta[] = bank.map(toQuestionMeta);
    const nextId = selectNextQuestion(metas, stateMap, new Set());
    const nextRow = bank.find((q) => q.id === nextId);
    if (!nextRow) return reply.code(503).send({ error: 'no_questions_available' });

    await recordEvent(db, 'question_presented', studentId, {
      assessmentId: assessment.id,
      questionId: nextRow.id,
    });

    return reply.code(201).send({
      assessmentId: assessment.id,
      question: toPublicQuestion(nextRow),
      progress: { asked: 0 },
    });
  });

  app.get<{ Params: { id: string } }>('/v1/assessments/:id', async (req, reply) => {
    const assessment = await db.assessment.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { responses: true } } },
    });
    if (!assessment) return reply.code(404).send({ error: 'assessment_not_found' });
    return {
      id: assessment.id,
      status: assessment.status,
      type: assessment.type,
      asked: assessment._count.responses,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
    };
  });

  app.post<{
    Params: { id: string };
    Body: { questionId?: string; answer?: string; idk?: boolean };
  }>('/v1/assessments/:id/responses', async (req, reply) => {
    const { questionId, answer, idk } = req.body ?? {};
    if (!questionId) return reply.code(400).send({ error: 'questionId_required' });
    if (!answer && !idk) return reply.code(400).send({ error: 'answer_or_idk_required' });

    const assessment = await db.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return reply.code(404).send({ error: 'assessment_not_found' });
    if (assessment.status !== 'in_progress') {
      return reply.code(409).send({ error: 'assessment_not_in_progress' });
    }

    const bank = await loadQuestionBank(db);
    const bankById = new Map(bank.map((q) => [q.id, q] as const));
    const question = bankById.get(questionId);
    if (!question) return reply.code(404).send({ error: 'question_not_found' });

    // Prevent answering the same question twice within an assessment.
    const already = await db.assessmentResponse.findFirst({
      where: { assessmentId: assessment.id, questionId },
    });
    if (already) return reply.code(409).send({ error: 'question_already_answered' });

    const outcome = outcomeFor(question, answer, Boolean(idk));
    const now = new Date();

    await db.assessmentResponse.create({
      data: {
        assessmentId: assessment.id,
        questionId,
        answerGiven: idk ? '__IDK__' : (answer as string),
        isCorrect: outcome === 'correct',
      },
    });
    await recordEvent(db, 'question_answered', assessment.studentId, {
      assessmentId: assessment.id,
      questionId,
      outcome,
    });

    // Update mastery for each skill the question touches, and persist.
    const stateRows = await loadSkillStateRows(db, assessment.studentId);
    const stateMap = new Map<string, MasteryState>();
    for (const [id, r] of stateRows) stateMap.set(id, toMasteryState(r));

    for (const skillId of question.skills) {
      const prevRow = stateRows.get(skillId);
      const prev = toMasteryState(prevRow);
      const next = updateMastery(prev, outcome, effectiveDifficulty(question));
      const streak = outcome === 'correct' ? (prevRow?.streak ?? 0) + 1 : 0;

      await db.studentSkillState.upsert({
        where: { studentId_skillId: { studentId: assessment.studentId, skillId } },
        create: {
          studentId: assessment.studentId,
          skillId,
          masteryProbability: next.masteryProbability,
          confidence: next.confidence,
          evidenceCount: next.evidenceCount,
          lastAssessedAt: now,
          lastCorrectAt: outcome === 'correct' ? now : null,
          lastIncorrectAt: outcome === 'correct' ? null : now,
          streak,
          assessmentId: assessment.id,
        },
        update: {
          masteryProbability: next.masteryProbability,
          confidence: next.confidence,
          evidenceCount: next.evidenceCount,
          lastAssessedAt: now,
          ...(outcome === 'correct' ? { lastCorrectAt: now } : { lastIncorrectAt: now }),
          streak,
          assessmentId: assessment.id,
        },
      });
      stateMap.set(skillId, next);
      await recordEvent(db, 'skill_state_changed', assessment.studentId, {
        assessmentId: assessment.id,
        skillId,
        band: masteryBand(next),
      });
    }

    // Decide whether to continue.
    const answeredRows = await db.assessmentResponse.findMany({
      where: { assessmentId: assessment.id },
      select: { questionId: true },
    });
    const askedIds = new Set(answeredRows.map((r) => r.questionId));
    const metas: QuestionMeta[] = bank.map(toQuestionMeta);

    const stopReason = evaluateStop(metas, stateMap, askedIds, DEFAULT_DIAGNOSTIC_CONFIG);
    if (stopReason) {
      return { done: true, stopReason, progress: { asked: askedIds.size } };
    }

    const nextId = selectNextQuestion(metas, stateMap, askedIds, DEFAULT_DIAGNOSTIC_CONFIG);
    const nextRow = nextId ? bankById.get(nextId) : undefined;
    if (!nextRow) {
      return { done: true, stopReason: 'exhausted', progress: { asked: askedIds.size } };
    }

    await recordEvent(db, 'question_presented', assessment.studentId, {
      assessmentId: assessment.id,
      questionId: nextRow.id,
    });
    return { done: false, question: toPublicQuestion(nextRow), progress: { asked: askedIds.size } };
  });

  app.post<{ Params: { id: string } }>('/v1/assessments/:id/complete', async (req, reply) => {
    const assessment = await db.assessment.findUnique({ where: { id: req.params.id } });
    if (!assessment) return reply.code(404).send({ error: 'assessment_not_found' });

    const stateRows = await loadSkillStateRows(db, assessment.studentId);
    const entries = [...stateRows.values()].map((r) => ({ skillId: r.skillId, state: toMasteryState(r) }));

    const level = estimateLevel(entries);
    const gaps = topGaps(entries, 3);
    const strengths = topStrengths(entries, 3);
    const recommendation = recommendFromGaps(gaps);

    if (assessment.status === 'in_progress') {
      const durationSeconds = Math.round((Date.now() - assessment.startedAt.getTime()) / 1000);
      await db.assessment.update({
        where: { id: assessment.id },
        data: { status: 'completed', completedAt: new Date(), durationSeconds },
      });
      if (recommendation) {
        await db.recommendation.create({
          data: {
            studentId: assessment.studentId,
            skillId: recommendation.skillId,
            priority: 1,
            reasonCodes: recommendation.reasonCodes,
            explanation: recommendation.explanation,
          },
        });
      }
      await recordEvent(db, 'diagnostic_completed', assessment.studentId, {
        assessmentId: assessment.id,
        level: level.level,
        assessedSkillCount: level.assessedSkillCount,
      });
    }

    return {
      level: { level: level.level, range: level.range, confidence: level.confidence },
      assessedSkillCount: level.assessedSkillCount,
      gaps: gaps.map((g) => ({ skillId: g.skillId, band: g.band })),
      strengths: strengths.map((s) => ({ skillId: s.skillId, band: s.band })),
      recommendation,
    };
  });

  // --- Questions ----------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/questions/:id', async (req, reply) => {
    const bank = await loadQuestionBank(db);
    const row = bank.find((q) => q.id === req.params.id) as QuestionRow | undefined;
    if (!row) return reply.code(404).send({ error: 'question_not_found' });
    return toPublicQuestion(row);
  });

  return app;
}
