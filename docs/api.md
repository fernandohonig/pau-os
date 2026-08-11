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

## Catalog & Goals (Week 5)

### `GET /v1/catalog/degrees`
- `200 { "degrees": [{ "id", "university", "name": {ca,es}, "weightings": [{subject,coefficient}] }], "provisional": true }`

`provisional: true` flags that weightings/cutoffs are placeholders pending
verified official import (spec §35).

### `GET /v1/catalog/universities`
- `200 { "universities": [{ "id", "name": {ca,es}, "region" }] }`

### `GET /v1/catalog/degrees/:id`
- `200 { "degree": {...}, "cutoffs": [{ "academicYear", "assignment", "score", "sourceType", "sourceAuthority" }] }`
- `404 { "error": "degree_not_found" }`

Cutoffs are historical/estimated observations, **not required scores** (spec §4).

### `GET /v1/catalog/skills`
- `200 { "skills": [{ "id", "name": {ca,es} }] }`

### `POST /v1/goals`  ·  `GET /v1/goals/:id`  ·  `PATCH /v1/goals/:id`  ·  `GET /v1/students/:id/goal`
Create/read/update a target degree goal (optional `targetScore` 0–14).

### `GET /v1/students/:id/target-estimate`
Honest goal estimate: the **Matemàtiques II subject level** and its
specific-phase contribution for the target degree's weighting. It deliberately
does **not** predict the full 14-point admission score.

- `200 { "goal": null }` when no goal is set, else:
  ```json
  {
    "goal": { "degreeId": "ub-matematiques", "targetScore": 12 },
    "degreeName": "Matemàtiques",
    "subjectLevel": { "level": 7.7, "range": [6.4, 9], "confidence": 0.3, "assessedSkillCount": 12 },
    "contribution": { "subject": "mathematics-ii", "coefficient": 0.2, "points": 1.54, "range": [1.28, 1.8] },
    "cutoff": { "score": 12, "assignment": "first", "academicYear": 2026, "sourceType": "estimated", "sourceAuthority": "PLACEHOLDER — not official" },
    "disclaimer": "Estimate for Matemàtiques II only. ... not a required score."
  }
  ```

## Recommendations (Next Best Action, Week 6)

### `GET /v1/students/:id/recommendations`
Live NBA ranking (spec §12), recomputed from current state (reflects latest
practice and goal changes).
- `200 { "recommendations": [{ "skillId", "skillName", "priority", "reasonCodes": [...], "explanation" }] }`

Reason codes: `LOW_MASTERY`, `DEVELOPING_MASTERY`, `HIGH_LEARNING_VALUE`,
`LOW_CONFIDENCE`, `NEEDS_EVIDENCE`, `HIGH_TARGET_RELEVANCE`,
`HIGH_EXAM_RELEVANCE`, `PREREQUISITES_WEAK`, `RECENTLY_PRACTICED`.

## Practice

### Adaptive session (Week 6, spec §14)

`POST /v1/students/:id/sessions` — compose a mixed ~15-min session (retrieval /
confidence / challenge / spaced / exam-style) from the NBA ranking.
- `201 { "sessionId", "recommendedSkills": [...], "questions": [PublicQuestion], "progress": { "answered": 0, "total": n } }`
- `expected_learning_gain` is computed but kept internal (spec §14), emitted only to analytics.

`POST /v1/sessions/:id/responses` — Body `{ "questionId", "answer"?, "idk"? }`.
Reveals correctness + explanation and updates mastery.
- `200 { "correct", "outcome", "explanation": {ca,es}, "skills": [{skillId,band}], "progress": { "answered" } }`
- `404 session_not_found | question_not_found` · `409 session_not_in_progress | question_already_answered`

`POST /v1/sessions/:id/complete` — finalize + recompute progress.
- `200 { "level": {...}, "skills": [{skillId, band}] }`

### Single-item practice (Week 4)

`GET /v1/students/:id/practice/next` → `{ "skillId", "question": PublicQuestion }` or `{ "done": true }`

`POST /v1/practice/answer` — Body `{ "studentId", "questionId", "answer"?, "idk"? }`; reveals correctness + explanation.
- `200 { "correct", "outcome", "explanation": {ca,es}, "skills": [{skillId, band}] }`

## Learning validation & admin (Weeks 7–8)

### `GET /v1/students/:id/learning-gain`
Replays the first (pre) and latest (post) completed diagnostics to estimate the
level at each, then reports gain and gain-per-hour.
- `200 { "preLevel", "postLevel", "gain", "studyMinutes", "learningGainPerHour", "diagnosticsCompleted" }`
- `200 { "gain": null, "diagnosticsCompleted": n, "note": "..." }` when fewer than 2 diagnostics.

### `GET /v1/admin/metrics/summary`
Cohort aggregate for the pilot (completion rate, avg study minutes, avg learning
gain and gain/hour) plus `eventCounts` by analytics event.
**Admin only** — requires an admin bearer token (`401` without a token, `403`
for a non-admin). See [Authentication](#authentication).

### `DELETE /v1/students/:id`
Right to erasure (spec §23): deletes the student and cascades to all derived
data; analytics events are anonymized.
- `200 { "deleted": true }` · `404 { "error": "student_not_found" }`

## Content review (admin, spec §17/§19)

Reviewers inspect and approve content. Only `approved`/`published` questions are
served to students; everything else stays in the review queue. Review state is
**DB-authoritative** — the content importer seeds new questions as
`pending_review` and never overwrites an admin decision on re-import (Git remains
the source of truth for question *content*, not review status).

All routes below are **admin only** — an admin bearer token is required (`401`
without a token, `403` for a non-admin). See [Authentication](#authentication).
Each decision appends an auditable `ContentReview` row (spec §24). `:id` is a
question id.

### `GET /v1/admin/reviews`
List questions awaiting review. Optional `?status=` (comma-separated) overrides
the default queue states (`draft,automated_validation,pending_review`).
- `200 { "reviews": AdminQuestion[] }` — full detail incl. `answer`, `explanation`, `reviewStatus`, provenance.

### `GET /v1/admin/reviews/:id`
Full question detail plus its review history.
- `200 { "question": AdminQuestion, "history": ContentReview[] }`
- `404 { "error": "question_not_found" }`

### `POST /v1/admin/reviews/:id/approve`
Set `reviewStatus = "approved"` (question becomes servable). Body: `{ "notes"?: string }`.
- `200 { "id": string, "reviewStatus": "approved" }`
- `404 { "error": "question_not_found" }`

### `POST /v1/admin/reviews/:id/reject`
Set `reviewStatus = "rejected"` (kept out of the served bank). Body: `{ "notes"?: string }`.
- `200 { "id": string, "reviewStatus": "rejected" }`
- `404 { "error": "question_not_found" }`

### `PATCH /v1/admin/questions/:id`
Edit content fields and/or `reviewStatus`. Body (all optional): `questionCA`,
`questionES`, `options`, `answer`, `explanation`, `skills`, `competencies`,
`difficultyInitial`, `sourceType`, `reviewStatus`.
> Content edits are overwritten by a re-import (Git owns content); only review
> status is DB-authoritative.
- `200 { "question": AdminQuestion }`
- `400 { "error": "no_fields_to_update" }` · `404 { "error": "question_not_found" }`

## Authentication

Students are anonymous-first (spec §20/§23): no token is required for the
diagnostic. Tokens add an **optional** persistent identity and gate admin
access. See [auth.md](auth.md) for GCP setup and env vars.

Send a session token as `Authorization: Bearer <token>`. Tokens are signed JWTs
issued by the API (30-day TTL); the API never stores Google's ID token.

### `GET /v1/auth/me`
Return the current identity from the bearer token.
- `200 { "role": Role, "email": string | null, "studentId": string | null }`
- `401 { "error": "unauthorized" }`

### `POST /v1/auth/google`
Exchange a Google ID token for a pau-os session token. Verified against
`GOOGLE_CLIENT_ID` (the OAuth Web client ID) as the audience.

Body: `{ "idToken": string, "linkStudentId"?: string }`
(`linkStudentId` links the caller's current anonymous student to the email, if
that student has no email yet)

- `200 { "token": string, "role": Role, "email": string | null, "studentId": string | null }`
- `400 { "error": "idToken_required" }`
- `401 { "error": "invalid_google_token" }` — includes the case where
  `GOOGLE_CLIENT_ID` is unset (verification always fails, so Google auth is off)

`role` is `admin` if the verified email is in `ADMIN_EMAILS`, else `student`.
Admins get an email-keyed token; students get (or reuse) an anonymous student
record keyed by email.

### `POST /v1/auth/dev` (non-production only)
Env-gated fake login for local testing — no Google setup needed. Enabled when
`AUTH_DEV_LOGIN` is on (default outside production).

Body: `{ "role"?: "student" | "admin", "email"?: string }`
- `200 { "token": string, "role": Role, "email": string | null, "studentId": string | null }`
- `404 { "error": "dev_login_disabled" }` when disabled

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
