import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createPrisma, type Db } from './prisma.js';
import type { AuthConfig } from './auth.js';

const DB_URL = process.env.DATABASE_URL;

// Test auth config: dev login on, a known admin allowlist, and a stubbed Google
// verifier so the OAuth path is testable without real Google tokens.
const testAuth: AuthConfig = {
  jwtSecret: 'test-secret',
  adminEmails: ['admin@pau.os'],
  devLoginEnabled: true,
  verifyGoogleIdToken: async (t: string) =>
    t === 'good-google-student' ? { email: 'linked@example.com' } : null,
};

// Integration test: requires a migrated, seeded database. Skips cleanly when no
// DATABASE_URL is configured so unit-only CI stays green.
describe.skipIf(!DB_URL)('diagnostic flow (integration)', () => {
  let db: Db;
  let app: FastifyInstance;
  let studentId: string;

  beforeAll(async () => {
    db = createPrisma(DB_URL as string);
    app = buildApp(db, testAuth);
    await app.ready();
    // Serving is now gated on review approval, but seed content imports as
    // `pending_review`. Approve the ambient bank so the student-flow tests have
    // servable questions (the admin-review tests use their own fixtures).
    await db.question.updateMany({
      where: { subject: 'mathematics-ii', reviewStatus: { notIn: ['approved', 'published'] } },
      data: { reviewStatus: 'approved' },
    });
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

    // Cohort summary is admin-only: unauthenticated is rejected.
    const noAuth = await app.inject({ method: 'GET', url: '/v1/admin/metrics/summary' });
    expect(noAuth.statusCode).toBe(401);

    const adminToken = (
      await app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { role: 'admin' } })
    ).json().token;
    const summary = (
      await app.inject({
        method: 'GET',
        url: '/v1/admin/metrics/summary',
        headers: { authorization: `Bearer ${adminToken}` },
      })
    ).json();
    expect(summary.summary.students).toBeGreaterThan(0);
    expect(typeof summary.eventCounts.diagnostic_completed).toBe('number');

    // Right to erasure removes the student.
    const del = await app.inject({ method: 'DELETE', url: `/v1/students/${sid}` });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/v1/students/${sid}` });
    expect(after.statusCode).toBe(404);
  });

  it('handles auth: dev login, google sign-in, and admin gating', async () => {
    const devStudent = (
      await app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { role: 'student' } })
    ).json();
    expect(devStudent.role).toBe('student');
    expect(devStudent.studentId).toBeTruthy();

    // A student token is not sufficient for admin endpoints.
    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/admin/metrics/summary',
      headers: { authorization: `Bearer ${devStudent.token}` },
    });
    expect(forbidden.statusCode).toBe(403);

    // /v1/auth/me reflects the token.
    const me = (
      await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { authorization: `Bearer ${devStudent.token}` },
      })
    ).json();
    expect(me.role).toBe('student');
    expect(me.studentId).toBe(devStudent.studentId);

    // Google sign-in (stubbed verifier) creates/links a student by email.
    const google = (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/google',
        payload: { idToken: 'good-google-student' },
      })
    ).json();
    expect(google.role).toBe('student');
    expect(google.email).toBe('linked@example.com');
    expect(google.studentId).toBeTruthy();

    const badGoogle = await app.inject({
      method: 'POST',
      url: '/v1/auth/google',
      payload: { idToken: 'nope' },
    });
    expect(badGoogle.statusCode).toBe(401);

    await db.student.delete({ where: { id: devStudent.studentId } }).catch(() => undefined);
    await db.student.delete({ where: { id: google.studentId } }).catch(() => undefined);
  });

  // --- Admin content review ------------------------------------------------
  describe('admin content review', () => {
    const fixtureIds: string[] = [];

    async function makePendingQuestion(suffix: string): Promise<string> {
      const id = `test-review-${suffix}`;
      await db.question.create({
        data: {
          id,
          version: 1,
          region: 'catalunya',
          academicYear: 2026,
          subject: 'mathematics-ii',
          type: 'multiple_choice',
          skills: ['mathematics.algebra.polynomials'],
          competencies: ['reasoning'],
          difficultyInitial: 0.5,
          questionCA: 'Fixture question',
          options: [
            { id: 'A', ca: 'a' },
            { id: 'B', ca: 'b' },
          ],
          answer: { type: 'single', correct: 'A' },
          explanation: { ca: 'because' },
          sourceType: 'community',
          reviewStatus: 'pending_review',
        },
      });
      fixtureIds.push(id);
      return id;
    }

    async function adminToken(): Promise<string> {
      return (
        await app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { role: 'admin' } })
      ).json().token;
    }

    afterAll(async () => {
      for (const id of fixtureIds) {
        await db.contentReview.deleteMany({ where: { contentId: id } }).catch(() => undefined);
        await db.question.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it('gates all review routes behind an admin token', async () => {
      const student = (
        await app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { role: 'student' } })
      ).json();
      for (const url of ['/v1/admin/reviews', '/v1/admin/reviews/x']) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
        expect(
          (
            await app.inject({
              method: 'GET',
              url,
              headers: { authorization: `Bearer ${student.token}` },
            })
          ).statusCode,
        ).toBe(403);
      }
      await db.student.delete({ where: { id: student.studentId } }).catch(() => undefined);
    });

    it('lists the queue, approves a question, and serves it', async () => {
      const id = await makePendingQuestion('approve');
      const token = await adminToken();
      const auth = { authorization: `Bearer ${token}` };

      const queue = (await app.inject({ method: 'GET', url: '/v1/admin/reviews', headers: auth })).json();
      expect(queue.reviews.some((r: { id: string }) => r.id === id)).toBe(true);
      // Admins see the correct answer (unlike the public shape).
      const item = queue.reviews.find((r: { id: string }) => r.id === id);
      expect(item.answer).toBeTruthy();

      const approve = await app.inject({
        method: 'POST',
        url: `/v1/admin/reviews/${id}/approve`,
        headers: auth,
        payload: { notes: 'looks good' },
      });
      expect(approve.statusCode).toBe(200);
      expect(approve.json().reviewStatus).toBe('approved');

      // Review state persisted + audited.
      const q = await db.question.findUnique({ where: { id } });
      expect(q?.reviewStatus).toBe('approved');
      expect(q?.reviewedBy).toBeTruthy();
      const audit = await db.contentReview.findMany({ where: { contentId: id } });
      expect(audit.length).toBe(1);
      expect(audit[0].status).toBe('approved');
      expect(audit[0].notes).toBe('looks good');

      // Approved content is now servable.
      const detail = (
        await app.inject({ method: 'GET', url: `/v1/admin/reviews/${id}`, headers: auth })
      ).json();
      expect(detail.question.reviewStatus).toBe('approved');
      expect(detail.history.length).toBe(1);
    });

    it('rejects a question and keeps it out of the served bank', async () => {
      const id = await makePendingQuestion('reject');
      const token = await adminToken();
      const auth = { authorization: `Bearer ${token}` };

      const reject = await app.inject({
        method: 'POST',
        url: `/v1/admin/reviews/${id}/reject`,
        headers: auth,
      });
      expect(reject.statusCode).toBe(200);
      expect(reject.json().reviewStatus).toBe('rejected');

      // A rejected question is not served (404 via the usable bank).
      const served = await app.inject({ method: 'GET', url: `/v1/questions/${id}` });
      expect(served.statusCode).toBe(404);
    });

    it('returns 404 for an unknown review id', async () => {
      const token = await adminToken();
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/reviews/does-not-exist',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('patches a question field and audits the edit', async () => {
      const id = await makePendingQuestion('patch');
      const token = await adminToken();
      const auth = { authorization: `Bearer ${token}` };

      const empty = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/questions/${id}`,
        headers: auth,
        payload: {},
      });
      expect(empty.statusCode).toBe(400);

      const patched = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/questions/${id}`,
        headers: auth,
        payload: { questionCA: 'Edited text' },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().question.question.ca).toBe('Edited text');

      const audit = await db.contentReview.findMany({ where: { contentId: id, status: 'edited' } });
      expect(audit.length).toBe(1);
    });
  });
});
