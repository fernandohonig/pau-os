# PAU OS API Contract (v1)

Base path: `/v1`. All requests/responses are JSON. No authentication is
required for the diagnostic flow (spec §20). Implemented in `services/api`
(Fastify + Prisma 7 driver adapter).

Correctness is **never** revealed during a diagnostic (spec Screen 4): question
payloads omit `answer` and `explanation`, and response submissions do not return
whether the answer was right.

---

## Health

`GET /health` → `200 { "status": "ok" }`

---

## Students

### `POST /v1/students`
Create an anonymous student.

- `201 { "id": string }`

### `GET /v1/students/:id`
- `200 { "id": string, "createdAt": string }`
- `404 { "error": "student_not_found" }`

### `GET /v1/students/:id/skills`
Skill profile as user-facing bands (raw probability is not exposed).

- `200 { "skills": [{ "skillId": string, "band": Band, "confidence": number, "evidenceCount": number }] }`
- `404 { "error": "student_not_found" }`

`Band` ∈ `insufficient_evidence | weak | developing | mastered`.

---

## Assessments (diagnostic)

### `POST /v1/assessments`
Start a diagnostic and get the first question.

Body: `{ "studentId": string }`

- `201 { "assessmentId": string, "question": PublicQuestion, "progress": { "asked": 0 } }`
- `400 { "error": "studentId_required" }`
- `404 { "error": "student_not_found" }`
- `503 { "error": "no_questions_available" }`

### `POST /v1/assessments/:id/responses`
Submit an answer; get the next question or a stop signal. The engine updates
skill mastery and selects the next question adaptively.

Body: `{ "questionId": string, "answer"?: string, "idk"?: boolean }`
(one of `answer` or `idk` is required)

- `200 { "done": false, "question": PublicQuestion, "progress": { "asked": number } }`
- `200 { "done": true, "stopReason": "confident" | "exhausted" | "max_questions", "progress": { "asked": number } }`
- `400 { "error": "questionId_required" | "answer_or_idk_required" }`
- `404 { "error": "assessment_not_found" | "question_not_found" }`
- `409 { "error": "assessment_not_in_progress" | "question_already_answered" }`

### `POST /v1/assessments/:id/complete`
Finalize and compute results (idempotent — safe to call once the diagnostic is
done; only the first call writes completion + recommendation).

- `200`:
  ```json
  {
    "level": { "level": 7.7, "range": [6.4, 9.0], "confidence": 0.3 },
    "assessedSkillCount": 12,
    "gaps": [{ "skillId": "mathematics.analysis.limits", "band": "weak" }],
    "strengths": [{ "skillId": "mathematics.analysis.derivative_rules", "band": "mastered" }],
    "recommendation": {
      "skillId": "mathematics.analysis.limits",
      "reasonCodes": ["LOW_MASTERY", "LOW_CONFIDENCE"],
      "explanation": "This is currently your weakest assessed area. ..."
    }
  }
  ```
- `404 { "error": "assessment_not_found" }`

`level.range` is always a `[low, high]` pair within `[0, 10]`; it widens when
confidence is low (spec §13 — no false precision).

### `GET /v1/assessments/:id`
- `200 { "id": string, "status": string, "type": string, "asked": number, "startedAt": string, "completedAt": string | null }`
- `404 { "error": "assessment_not_found" }`

---

## Questions

### `GET /v1/questions/:id`
- `200 PublicQuestion`
- `404 { "error": "question_not_found" }`

---

## Types

```ts
interface PublicQuestion {
  id: string;
  type: string;                 // e.g. "multiple_choice"
  skills: string[];             // skill IDs
  difficulty: number;           // 0..1 (calibrated if available)
  question: { ca: string; es?: string };
  options: Array<{ id: string; ca: string; es?: string }>;
  // NOTE: no `answer`, no `explanation`.
}
```

---

## Analytics events (spec §22)

Emitted to `learning_events` during the flow: `diagnostic_started`,
`question_presented`, `question_answered`, `skill_state_changed`,
`diagnostic_completed`.
