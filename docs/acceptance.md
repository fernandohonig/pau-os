# MVP Acceptance Criteria (spec §27)

Status of each criterion against the current build. Verified by the test suite
(`pnpm test`, 87 tests incl. live Postgres integration) and live smoke checks
unless noted.

## Student

- [x] Can start without an account — `POST /v1/students` (anonymous)
- [x] Can select a degree/university — `POST /v1/goals`, catalog endpoints
- [x] Can complete a diagnostic — assessment start/responses/complete
- [x] Receives a skill profile — `GET /v1/students/:id/skills` (bands)
- [x] Receives a next action — live NBA `GET /v1/students/:id/recommendations`
- [x] Can complete a practice session — composed sessions (spec §14)
- [x] Sees progress — skills + `GET /v1/students/:id/target-estimate`

## Engine

- [x] Adapts questions — `@pau/assessment` next-question selection
- [x] Updates skill states — `@pau/scoring` Bayesian update, persisted
- [x] Prioritizes target-relevant skills — `target_relevance` in NBA + selection
- [x] Avoids excessive repetition — recency factor + repetition penalty
- [x] Records evidence — `StudentSkillState.evidenceCount`, responses stored

## Content

- [x] All questions have provenance — enforced by schema; validated in CI
- [x] All questions reference valid skills — cross-reference validation
- [x] Content passes CI — `pnpm validate-content` (44 skills / 30 questions)
- [x] Official content distinguishable — provenance types; nothing false-marked
      `official` (agent-authored items are `community`; university data provisional)

## Admin

- [x] Reviewer can inspect and approve content — admin review endpoints
      (`/v1/admin/reviews`, approve/reject, `PATCH /v1/admin/questions/:id`) +
      mobile review queue; only approved content is served (spec §17/§19)
- [x] Changes are auditable — content lives in Git (diff/history); admin
      decisions append `ContentReview` rows; `learning_events` records system actions

## Data

- [x] Events are recorded — all §22 events emitted; `GET /v1/admin/metrics/summary`
- [x] No unnecessary personal information is collected — see `docs/privacy.md`

## Tests

- [x] Unit tests for scoring — `@pau/scoring`
- [x] Unit tests for adaptive selection — `@pau/assessment`, `@pau/recommendation`
- [x] Schema tests — `@pau/content-schema`
- [x] Integration test for a complete diagnostic — `services/api` app test
- [x] Integration test for a complete practice session — `@pau/api-client`, app test

## Learning validation (spec §26 Weeks 7–8)

- [x] Pre/post diagnostic learning gain — `GET /v1/students/:id/learning-gain`
- [x] Learning Gain / Hour (primary metric) — computed from study minutes
- [x] Cohort summary — `GET /v1/admin/metrics/summary`
- [~] 50-student pilot + interviews — operational step, not code

Legend: [x] done · [~] partially done / deferred with a clear reason.
