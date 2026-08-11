import Fastify, { type FastifyInstance } from 'fastify';
import {
  selectNextQuestion,
  evaluateStop,
  DEFAULT_DIAGNOSTIC_CONFIG,
  type QuestionMeta,
} from '@pau/assessment';
import {
  updateMastery,
  INITIAL_MASTERY,
  masteryBand,
  buildTargetRelevance,
  estimateSubjectContribution,
  type MasteryState,
} from '@pau/scoring';
import { estimateLevel, topGaps, topStrengths, recommendFromGaps } from '@pau/knowledge-model';
import type { Db } from './prisma.js';
import { recordEvent } from './analytics.js';
import {
  loadQuestionBank,
  toQuestionMeta,
  toPublicQuestion,
  outcomeFor,
  effectiveDifficulty,
  explanationOf,
  type QuestionRow,
} from './questions.js';

interface SkillStateRow {
  skillId: string;
  masteryProbability: number;
  confidence: number;
  evidenceCount: number;
  streak: number;
}

interface GoalRow {
  id: string;
  studentId: string;
  degreeId: string;
  targetScore: number | null;
  updatedAt: Date;
}

function toGoalDto(goal: GoalRow): {
  id: string;
  studentId: string;
  degreeId: string;
  targetScore: number | null;
} {
  return {
    id: goal.id,
    studentId: goal.studentId,
    degreeId: goal.degreeId,
    targetScore: goal.targetScore,
  };
}

interface DegreeRow {
  id: string;
  universityId: string;
  nameCA: string;
  nameES: string | null;
  admissionScoreMax: number;
  weightings: unknown;
}

function degreeWeightings(row: DegreeRow): { subject: string; coefficient: number }[] {
  return Array.isArray(row.weightings)
    ? (row.weightings as { subject: string; coefficient: number }[])
    : [];
}

/**
 * Build a target-relevance function (spec §12) from the student's current goal:
 * the target degree's subject weightings mapped over each skill's subject.
 * Returns undefined when the student has no goal. In the single-subject MVP the
 * result is uniform, but the hook is wired for multi-subject targets.
 */
async function loadTargetRelevance(
  db: Db,
  studentId: string,
): Promise<((skillId: string) => number) | undefined> {
  const goal = await db.studentGoal.findFirst({
    where: { studentId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!goal) return undefined;
  const degree = (await db.degree.findUnique({ where: { id: goal.degreeId } })) as DegreeRow | null;
  if (!degree) return undefined;
  const weightings = degreeWeightings(degree);
  if (weightings.length === 0) return undefined;

  const skills = await db.skill.findMany({ select: { id: true, subject: true } });
  const subjectMap = new Map(skills.map((s) => [s.id, s.subject]));
  return buildTargetRelevance(weightings, (id) => subjectMap.get(id));
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

  // Latest active recommendations for the student (most recent first).
  app.get<{ Params: { id: string } }>('/v1/students/:id/recommendations', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const rows = await db.recommendation.findMany({
      where: { studentId: req.params.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return {
      recommendations: rows.map((r) => ({
        id: r.id,
        skillId: r.skillId,
        reasonCodes: r.reasonCodes,
        explanation: r.explanation,
        createdAt: r.createdAt,
      })),
    };
  });

  // Current goal (most recently updated), or null if none set yet.
  app.get<{ Params: { id: string } }>('/v1/students/:id/goal', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const goal = await db.studentGoal.findFirst({
      where: { studentId: req.params.id },
      orderBy: { updatedAt: 'desc' },
    });
    return { goal: goal ? toGoalDto(goal) : null };
  });

  // Honest goal estimate: the Matemàtiques II subject level and its
  // specific-phase contribution for the target degree. We deliberately do NOT
  // predict the full 14-point admission score (needs grades + a 2nd subject),
  // and cutoffs are shown as context only, never as a required score (spec §4/§13).
  app.get<{ Params: { id: string } }>('/v1/students/:id/target-estimate', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const goal = await db.studentGoal.findFirst({
      where: { studentId: req.params.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (!goal) return { goal: null };

    const degree = (await db.degree.findUnique({ where: { id: goal.degreeId } })) as DegreeRow | null;
    const rows = await loadSkillStateRows(db, req.params.id);
    const entries = [...rows.values()].map((r) => ({ skillId: r.skillId, state: toMasteryState(r) }));
    const level = estimateLevel(entries);
    const weightings = degree ? degreeWeightings(degree) : [];
    const contribution = estimateSubjectContribution(
      { level: level.level, range: level.range },
      weightings,
      'mathematics-ii',
    );
    const cutoff = await db.cutoff.findFirst({
      where: { degreeId: goal.degreeId },
      orderBy: { academicYear: 'desc' },
    });

    return {
      goal: { degreeId: goal.degreeId, targetScore: goal.targetScore },
      degreeName: degree ? degree.nameCA : goal.degreeId,
      subjectLevel: {
        level: level.level,
        range: level.range,
        confidence: level.confidence,
        assessedSkillCount: level.assessedSkillCount,
      },
      contribution,
      cutoff: cutoff
        ? {
            score: cutoff.score,
            assignment: cutoff.assignment,
            academicYear: cutoff.academicYear,
            sourceType: cutoff.sourceType,
            sourceAuthority: cutoff.sourceAuthority,
          }
        : null,
      disclaimer:
        'Estimate for Matemàtiques II only. The full admission score (up to 14) also depends on your general-phase grades and a second weighted subject. Any cutoff shown is a historical/estimated observation, not a required score.',
    };
  });

  // --- Catalog ------------------------------------------------------------
  // Degrees for goal selection, from imported content. `provisional` flags that
  // the weightings/cutoffs are placeholders pending verified official import.
  app.get('/v1/catalog/degrees', async () => {
    const [degrees, universities] = await Promise.all([db.degree.findMany(), db.university.findMany()]);
    const uni = new Map(universities.map((u) => [u.id, u.nameCA]));
    return {
      degrees: (degrees as DegreeRow[]).map((d) => ({
        id: d.id,
        university: uni.get(d.universityId) ?? d.universityId,
        name: { ca: d.nameCA, es: d.nameES ?? undefined },
        weightings: degreeWeightings(d),
      })),
      provisional: true,
    };
  });

  app.get('/v1/catalog/universities', async () => {
    const rows = await db.university.findMany();
    return {
      universities: rows.map((u) => ({
        id: u.id,
        name: { ca: u.nameCA, es: u.nameES ?? undefined },
        region: u.region,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/v1/catalog/degrees/:id', async (req, reply) => {
    const d = (await db.degree.findUnique({ where: { id: req.params.id } })) as DegreeRow | null;
    if (!d) return reply.code(404).send({ error: 'degree_not_found' });
    const cutoffs = await db.cutoff.findMany({
      where: { degreeId: d.id },
      orderBy: { academicYear: 'desc' },
    });
    return {
      degree: {
        id: d.id,
        universityId: d.universityId,
        name: { ca: d.nameCA, es: d.nameES ?? undefined },
        admissionScoreMax: d.admissionScoreMax,
        weightings: degreeWeightings(d),
      },
      // Cutoffs are historical observations, not required scores (spec §4).
      cutoffs: cutoffs.map((c) => ({
        academicYear: c.academicYear,
        assignment: c.assignment,
        score: c.score,
        sourceType: c.sourceType,
        sourceAuthority: c.sourceAuthority,
      })),
    };
  });

  // Skill catalog (id → localized name) so clients can render human labels.
  app.get('/v1/catalog/skills', async () => {
    const rows = await db.skill.findMany({
      where: { subject: 'mathematics-ii' },
      select: { id: true, nameCA: true, nameES: true },
    });
    return {
      skills: rows.map((r) => ({ id: r.id, name: { ca: r.nameCA, es: r.nameES ?? undefined } })),
    };
  });

  // --- Goals --------------------------------------------------------------
  app.post<{ Body: { studentId?: string; degreeId?: string; targetScore?: number } }>(
    '/v1/goals',
    async (req, reply) => {
      const { studentId, degreeId, targetScore } = req.body ?? {};
      if (!studentId || !degreeId) {
        return reply.code(400).send({ error: 'studentId_and_degreeId_required' });
      }
      const student = await db.student.findUnique({ where: { id: studentId } });
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const goal = await db.studentGoal.upsert({
        where: { studentId_degreeId: { studentId, degreeId } },
        create: { studentId, degreeId, targetScore: targetScore ?? null },
        update: { targetScore: targetScore ?? null },
      });
      return reply.code(201).send({ goal: toGoalDto(goal) });
    },
  );

  app.get<{ Params: { id: string } }>('/v1/goals/:id', async (req, reply) => {
    const goal = await db.studentGoal.findUnique({ where: { id: req.params.id } });
    if (!goal) return reply.code(404).send({ error: 'goal_not_found' });
    return { goal: toGoalDto(goal) };
  });

  app.patch<{ Params: { id: string }; Body: { targetScore?: number | null } }>(
    '/v1/goals/:id',
    async (req, reply) => {
      const existing = await db.studentGoal.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.code(404).send({ error: 'goal_not_found' });
      const goal = await db.studentGoal.update({
        where: { id: req.params.id },
        data: { targetScore: req.body?.targetScore ?? null },
      });
      return { goal: toGoalDto(goal) };
    },
  );

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
    const targetRelevance = await loadTargetRelevance(db, studentId);
    const nextId = selectNextQuestion(metas, stateMap, new Set(), DEFAULT_DIAGNOSTIC_CONFIG, targetRelevance);
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

    const targetRelevance = await loadTargetRelevance(db, assessment.studentId);
    const nextId = selectNextQuestion(metas, stateMap, askedIds, DEFAULT_DIAGNOSTIC_CONFIG, targetRelevance);
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

  // --- Practice -----------------------------------------------------------
  // Minimal practice (spec Screen 7): serve a question for the student's
  // weakest assessed skill; the adaptive session composition arrives in Week 6.
  app.get<{ Params: { id: string } }>('/v1/students/:id/practice/next', async (req, reply) => {
    const student = await db.student.findUnique({ where: { id: req.params.id } });
    if (!student) return reply.code(404).send({ error: 'student_not_found' });

    const bank = await loadQuestionBank(db);
    const rows = await loadSkillStateRows(db, req.params.id);

    // Prefer the weakest assessed skill; fall back to any skill in the bank.
    const assessed = [...rows.values()].filter((r) => r.evidenceCount > 0);
    assessed.sort((a, b) => a.masteryProbability - b.masteryProbability);
    const targetSkill = assessed[0]?.skillId ?? bank[0]?.skills[0];
    if (!targetSkill) return { done: true };

    const answered = await db.assessmentResponse.findMany({
      where: { assessment: { studentId: req.params.id } },
      select: { questionId: true },
    });
    const answeredIds = new Set(answered.map((a) => a.questionId));

    const forSkill = bank.filter((q) => q.skills.includes(targetSkill));
    const fresh = forSkill.filter((q) => !answeredIds.has(q.id));
    const chosen = (fresh[0] ?? forSkill[0]) as QuestionRow | undefined;
    if (!chosen) return { done: true };

    return { skillId: targetSkill, question: toPublicQuestion(chosen) };
  });

  // Answer a practice question — unlike the diagnostic, this reveals
  // correctness and the explanation (Screen 7) and updates mastery.
  app.post<{ Body: { studentId?: string; questionId?: string; answer?: string; idk?: boolean } }>(
    '/v1/practice/answer',
    async (req, reply) => {
      const { studentId, questionId, answer, idk } = req.body ?? {};
      if (!studentId || !questionId) {
        return reply.code(400).send({ error: 'studentId_and_questionId_required' });
      }
      if (!answer && !idk) return reply.code(400).send({ error: 'answer_or_idk_required' });

      const student = await db.student.findUnique({ where: { id: studentId } });
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const bank = await loadQuestionBank(db);
      const question = bank.find((q) => q.id === questionId);
      if (!question) return reply.code(404).send({ error: 'question_not_found' });

      const outcome = outcomeFor(question, answer, Boolean(idk));
      const now = new Date();
      const stateRows = await loadSkillStateRows(db, studentId);
      const updated: Array<{ skillId: string; band: ReturnType<typeof masteryBand> }> = [];

      for (const skillId of question.skills) {
        const prevRow = stateRows.get(skillId);
        const next = updateMastery(toMasteryState(prevRow), outcome, effectiveDifficulty(question));
        const streak = outcome === 'correct' ? (prevRow?.streak ?? 0) + 1 : 0;
        await db.studentSkillState.upsert({
          where: { studentId_skillId: { studentId, skillId } },
          create: {
            studentId,
            skillId,
            masteryProbability: next.masteryProbability,
            confidence: next.confidence,
            evidenceCount: next.evidenceCount,
            lastAssessedAt: now,
            lastCorrectAt: outcome === 'correct' ? now : null,
            lastIncorrectAt: outcome === 'correct' ? null : now,
            streak,
          },
          update: {
            masteryProbability: next.masteryProbability,
            confidence: next.confidence,
            evidenceCount: next.evidenceCount,
            lastAssessedAt: now,
            ...(outcome === 'correct' ? { lastCorrectAt: now } : { lastIncorrectAt: now }),
            streak,
          },
        });
        updated.push({ skillId, band: masteryBand(next) });
      }

      await recordEvent(db, 'question_answered', studentId, { questionId, outcome, mode: 'practice' });

      return {
        correct: outcome === 'correct',
        outcome,
        explanation: explanationOf(question),
        skills: updated,
      };
    },
  );

  // --- Questions ----------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/questions/:id', async (req, reply) => {
    const bank = await loadQuestionBank(db);
    const row = bank.find((q) => q.id === req.params.id) as QuestionRow | undefined;
    if (!row) return reply.code(404).send({ error: 'question_not_found' });
    return toPublicQuestion(row);
  });

  return app;
}
