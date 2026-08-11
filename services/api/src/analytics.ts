import type { Db } from './prisma.js';

/**
 * Analytics event names (spec §22). Only the events emitted by the assessment
 * flow are listed here; more are added as their features land.
 */
export type EventName =
  | 'diagnostic_started'
  | 'question_presented'
  | 'question_answered'
  | 'diagnostic_completed'
  | 'skill_state_changed'
  | 'recommendation_presented'
  | 'practice_started'
  | 'practice_completed';

/**
 * Record a learning event. Analytics must never break the primary flow, so
 * failures are swallowed after logging.
 */
export async function recordEvent(
  db: Db,
  event: EventName,
  studentId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    // `data` is a plain JSON object; Prisma's Json input type is stricter.
    await db.learningEvent.create({ data: { event, studentId, data: data as never } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`analytics: failed to record ${event}:`, err);
  }
}
