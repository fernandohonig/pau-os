import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createPrisma, type Db } from './prisma.js';

const DB_URL = process.env.DATABASE_URL;

// Integration test: requires a migrated, seeded database. Skips cleanly when no
// DATABASE_URL is configured so unit-only CI stays green.
describe.skipIf(!DB_URL)('diagnostic flow (integration)', () => {
  let db: Db;
  let app: FastifyInstance;
  let studentId: string;

  beforeAll(async () => {
    db = createPrisma(DB_URL as string);
    app = buildApp(db);
    await app.ready();
  });

  afterAll(async () => {
    if (studentId) {
      // Cascades to assessments, responses, skill states, recommendations.
      await db.student.delete({ where: { id: studentId } }).catch(() => undefined);
    }
    await app.close();
    await db.$disconnect();
  });

  it('runs a full diagnostic and returns explainable results', async () => {
    // Requires seeded questions (pnpm db:seed).
    const bankCount = await db.question.count({ where: { subject: 'mathematics-ii' } });
    expect(bankCount).toBeGreaterThan(0);

    // 1. Anonymous student.
    const studentRes = await app.inject({ method: 'POST', url: '/v1/students' });
    expect(studentRes.statusCode).toBe(201);
    studentId = studentRes.json().id;
    expect(studentId).toBeTruthy();

    // 2. Start the diagnostic.
    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/assessments',
      payload: { studentId },
    });
    expect(startRes.statusCode).toBe(201);
    const start = startRes.json();
    const assessmentId: string = start.assessmentId;
    expect(assessmentId).toBeTruthy();
    expect(start.question).toBeTruthy();
    // Correctness must never leak into the diagnostic question payload.
    expect(start.question.answer).toBeUndefined();
    expect(start.question.explanation).toBeUndefined();
    expect(Array.isArray(start.question.options)).toBe(true);

    // 3. Answer until the engine says we're done.
    let current = start.question;
    let done = false;
    let stopReason = '';
    let guard = 0;
    let answered = 0;
    while (!done) {
      const answer = current.options[0]?.id ?? 'A';
      const res = await app.inject({
        method: 'POST',
        url: `/v1/assessments/${assessmentId}/responses`,
        payload: { questionId: current.id, answer },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      answered++;
      if (body.done) {
        done = true;
        stopReason = body.stopReason;
      } else {
        expect(body.question.answer).toBeUndefined();
        current = body.question;
      }
      if (++guard > 40) throw new Error('diagnostic did not terminate');
    }
    expect(answered).toBeGreaterThan(0);
    expect(['confident', 'exhausted', 'max_questions']).toContain(stopReason);

    // 4. Complete and read results.
    const completeRes = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentId}/complete`,
    });
    expect(completeRes.statusCode).toBe(200);
    const results = completeRes.json();
    expect(typeof results.level.level).toBe('number');
    expect(results.level.range).toHaveLength(2);
    expect(results.level.range[0]).toBeLessThanOrEqual(results.level.range[1]);
    expect(results.assessedSkillCount).toBeGreaterThan(0);
    expect(Array.isArray(results.gaps)).toBe(true);
    expect(Array.isArray(results.strengths)).toBe(true);

    // 5. Skill profile exposes bands, not raw probabilities.
    const skillsRes = await app.inject({ method: 'GET', url: `/v1/students/${studentId}/skills` });
    expect(skillsRes.statusCode).toBe(200);
    const skills = skillsRes.json().skills;
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(['insufficient_evidence', 'weak', 'developing', 'mastered']).toContain(s.band);
      expect(s.masteryProbability).toBeUndefined();
    }

    // 6. Analytics: start and completion recorded.
    const events = await db.learningEvent.findMany({
      where: { studentId, event: { in: ['diagnostic_started', 'diagnostic_completed', 'question_answered'] } },
    });
    const names = new Set(events.map((e) => e.event));
    expect(names.has('diagnostic_started')).toBe(true);
    expect(names.has('diagnostic_completed')).toBe(true);
    expect(names.has('question_answered')).toBe(true);
  });

  it('rejects answering the same question twice', async () => {
    const studentRes = await app.inject({ method: 'POST', url: '/v1/students' });
    const sid = studentRes.json().id;
    const startRes = await app.inject({ method: 'POST', url: '/v1/assessments', payload: { studentId: sid } });
    const { assessmentId, question } = startRes.json();

    const first = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentId}/responses`,
      payload: { questionId: question.id, answer: question.options[0].id },
    });
    expect(first.statusCode).toBe(200);

    const dup = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentId}/responses`,
      payload: { questionId: question.id, answer: question.options[0].id },
    });
    expect(dup.statusCode).toBe(409);

    await db.student.delete({ where: { id: sid } }).catch(() => undefined);
  });

  it('measures learning gain across pre/post diagnostics and reports cohort metrics', async () => {
    const sid = (await app.inject({ method: 'POST', url: '/v1/students' })).json().id;

    // Helper: run a diagnostic to completion, answering a fixed option.
    async function runDiagnostic(): Promise<void> {
      const start = (
        await app.inject({ method: 'POST', url: '/v1/assessments', payload: { studentId: sid } })
      ).json();
      let q = start.question;
      let done = false;
      let guard = 0;
      while (!done) {
        const res = (
          await app.inject({
            method: 'POST',
            url: `/v1/assessments/${start.assessmentId}/responses`,
            payload: { questionId: q.id, answer: q.options[0].id },
          })
        ).json();
        if (res.done) done = true;
        else q = res.question;
        if (++guard > 40) throw new Error('did not terminate');
      }
      await app.inject({ method: 'POST', url: `/v1/assessments/${start.assessmentId}/complete` });
    }

    // Pre diagnostic, a practice session, then a post diagnostic.
    await runDiagnostic();
    const session = (await app.inject({ method: 'POST', url: `/v1/students/${sid}/sessions` })).json();
    for (const q of session.questions) {
      await app.inject({
        method: 'POST',
        url: `/v1/sessions/${session.sessionId}/responses`,
        payload: { questionId: q.id, answer: q.options[0].id },
      });
    }
    await app.inject({ method: 'POST', url: `/v1/sessions/${session.sessionId}/complete` });
    await runDiagnostic();

    const lg = (await app.inject({ method: 'GET', url: `/v1/students/${sid}/learning-gain` })).json();
    expect(lg.diagnosticsCompleted).toBe(2);
    expect(typeof lg.preLevel).toBe('number');
    expect(typeof lg.postLevel).toBe('number');
    expect(typeof lg.gain).toBe('number');

    // Required analytics events are recorded (spec §22).
    const events = await db.learningEvent.findMany({ where: { studentId: sid } });
    const names = new Set(events.map((e) => e.event));
    for (const required of [
      'onboarding_started',
      'diagnostic_started',
      'diagnostic_completed',
      'practice_started',
      'practice_completed',
      'recommendation_started',
      'recommendation_completed',
    ]) {
      expect(names.has(required)).toBe(true);
    }

    // Cohort summary aggregates without error.
    const summary = (await app.inject({ method: 'GET', url: '/v1/admin/metrics/summary' })).json();
    expect(summary.summary.students).toBeGreaterThan(0);
    expect(typeof summary.eventCounts.diagnostic_completed).toBe('number');

    // Right to erasure removes the student.
    const del = await app.inject({ method: 'DELETE', url: `/v1/students/${sid}` });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/v1/students/${sid}` });
    expect(after.statusCode).toBe(404);
  });
});
