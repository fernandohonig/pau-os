import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../services/api/src/app.js';
import { createPrisma, type Db } from '../../../services/api/src/prisma.js';
import { PauClient, ApiError } from './client.js';

const DB_URL = process.env.DATABASE_URL;

// Exercises the typed client against the real Fastify app (via inject). Skips
// when no database is configured. Requires seeded content (pnpm db:seed).
describe.skipIf(!DB_URL)('PauClient (integration)', () => {
  let db: Db;
  let app: FastifyInstance;
  let client: PauClient;
  const createdStudents: string[] = [];

  beforeAll(async () => {
    db = createPrisma(DB_URL as string);
    app = buildApp(db);
    await app.ready();

    const injectFetch = async (input: string, init?: RequestInit): Promise<Response> => {
      const u = new URL(input);
      const res = await app.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH',
        url: u.pathname + u.search,
        payload: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(res.body, {
        status: res.statusCode,
        headers: { 'content-type': (res.headers['content-type'] as string) ?? 'application/json' },
      });
    };

    client = new PauClient({ baseUrl: 'http://localhost', fetch: injectFetch });
  });

  afterAll(async () => {
    for (const id of createdStudents) {
      await db.student.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
    await db.$disconnect();
  });

  it('walks the full student journey: goal → diagnostic → results → recommendation', async () => {
    // Anonymous student.
    const student = await client.createStudent();
    createdStudents.push(student.id);
    expect(student.id).toBeTruthy();

    // Catalog + goal.
    const { degrees, provisional } = await client.getDegrees();
    expect(provisional).toBe(true);
    expect(degrees.length).toBeGreaterThan(0);

    const { goal } = await client.createGoal({
      studentId: student.id,
      degreeId: degrees[0].id,
      targetScore: 12,
    });
    expect(goal.degreeId).toBe(degrees[0].id);
    expect(goal.targetScore).toBe(12);

    const current = await client.getCurrentGoal(student.id);
    expect(current.goal?.id).toBe(goal.id);

    // Diagnostic.
    const start = await client.startAssessment(student.id);
    expect(start.question).toBeTruthy();
    expect((start.question as unknown as { answer?: unknown }).answer).toBeUndefined();

    let current_q = start.question;
    let done = false;
    let guard = 0;
    while (!done) {
      const result = await client.submitResponse(start.assessmentId, {
        questionId: current_q.id,
        answer: current_q.options[0]?.id ?? 'A',
      });
      if (result.done) {
        done = true;
      } else {
        current_q = result.question;
      }
      if (++guard > 40) throw new Error('did not terminate');
    }

    const results = await client.completeAssessment(start.assessmentId);
    expect(results.level.range).toHaveLength(2);
    expect(results.assessedSkillCount).toBeGreaterThan(0);

    // Profile + recommendations reflect the completed diagnostic.
    const { skills } = await client.getSkills(student.id);
    expect(skills.length).toBeGreaterThan(0);

    const { recommendations } = await client.getRecommendations(student.id);
    expect(Array.isArray(recommendations)).toBe(true);

    // Practice: fetch a question for the weakest skill and answer it.
    const next = await client.getPracticeNext(student.id);
    if (!('done' in next && next.done)) {
      const practiceResult = await client.submitPracticeAnswer({
        studentId: student.id,
        questionId: next.question.id,
        answer: next.question.options[0]?.id ?? 'A',
      });
      expect(typeof practiceResult.correct).toBe('boolean');
      // Practice DOES reveal the explanation (unlike the diagnostic).
      expect(practiceResult.explanation).toBeTruthy();
      expect(practiceResult.skills.length).toBeGreaterThan(0);
    }
  });

  it('surfaces API errors as ApiError with a code', async () => {
    await expect(client.getStudent('does-not-exist')).rejects.toBeInstanceOf(ApiError);
    await expect(client.getStudent('does-not-exist')).rejects.toMatchObject({
      status: 404,
      code: 'student_not_found',
    });
  });
});
