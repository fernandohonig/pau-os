# PAU OS Architecture v0.1

**Date:** 2026-08-11  
**Status:** Foundation Phase (Week 1)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Mobile/Web)              │
│                   React Native + Expo                   │
└────────────────────────┬────────────────────────────────┘
                         │
                    HTTPS / REST
                         │
┌────────────────────────▼────────────────────────────────┐
│                    API Gateway                          │
│              Fastify + TypeScript + Node                │
│                                                         │
│  ├─ Catalog Service (subjects, skills, questions)      │
│  ├─ Student Service (goals, accounts, progress)        │
│  ├─ Assessment Service (diagnostics, sessions)         │
│  ├─ Admin Service (content review, metrics)            │
│  └─ Analytics Service (event streaming)                │
└────────────────────────┬────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
    ┌───────▼───────┐   │   ┌────────▼────────┐
    │  PostgreSQL   │   │   │  Content Git    │
    │  (State)      │   │   │  (YAML/JSON)    │
    │               │   │   │                 │
    │ · Schemas     │   │   │ · Skills        │
    │ · Students    │   │   │ · Questions     │
    │ · Questions   │   │   │ · Exams         │
    │ · Responses   │   │   │ · Universities  │
    │ · Analytics   │   │   │ · Cutoffs       │
    └───────────────┘   │   └─────────────────┘
                        │
                   ┌────▼──────┐
                   │  Event Bus │
                   │ (Analytics)│
                   └───────────┘
```

---

## 2. Key Design Decisions

### 2.1 Content is Source of Truth in Git

- Educational content (skills, questions, exams, universities) lives in Git as YAML/JSON
- Database ingests validated content via import scripts
- Provenance and audit trails are preserved in Git history
- CI validates all content before merge
- Allows community contributions via pull requests
- **Rationale:** Decouples content governance from application state. Enables diff-based review and rollback.

### 2.2 PostgreSQL for Operational State Only

- Student data, sessions, responses, analytics in PostgreSQL
- Content ingested into a read replica or cache, never primary source
- **Rationale:** Operational state (assessments, responses) requires ACID. Content is versioned externally.

### 2.3 Monorepo with Workspace Organization

- `apps/`: Frontend (mobile, web, admin)
- `packages/`: Shared logic (assessment, knowledge-model, recommendation, scoring)
- `services/`: API server
- `content/`: YAML/JSON data
- `scripts/`: Tooling (import, validate, seed)
- **Rationale:** Shared logic is co-located with clear dependency boundaries. Avoids premature SDK extraction.

### 2.4 No Authentication Required for Initial Diagnostic

- Anonymous browsing and first diagnostic uses pseudonymous session IDs
- Persistent accounts optional; opt-in only
- **Rationale:** Lowers friction for pilot users. Complies with privacy principles for minors.

### 2.5 Simple Bayesian Skill Mastery Model

- Each skill has a mastery probability ∈ [0,1] per student
- Updated via evidence from question responses
- No complex ML in v0.1; transparent and auditable
- **Rationale:** Explainable to students and reviewers. Easy to verify and tune.

### 2.6 Adaptive Question Selection by Uncertainty

- Diagnostic and practice sessions select questions to maximize information gain
- Prioritizes high-uncertainty skills relevant to student's target degree
- **Rationale:** Reduces wasted study time; focuses on biggest gaps.

---

## 3. Core Entity Model

### Content Entities (Git)

```
Region
├─ AcademicYear
│  ├─ Subject
│  │  ├─ Curriculum
│  │  ├─ Skill (graph with prerequisites)
│  │  ├─ Question (references Skill, has provenance)
│  │  └─ Exam
│  │
│  └─ University
│     ├─ Degree (with skill weighting)
│     ├─ Weighting (subject coefficient)
│     └─ Cutoff (historical admission score)
```

### Operational Entities (PostgreSQL)

```
Student
├─ StudentGoal (target degree)
├─ Assessment (diagnostic)
│  ├─ AssessmentResponse (per question)
│  └─ StudentSkillState (mastery estimates)
├─ PracticeSession
│  ├─ SessionResponse (per question)
│  └─ Recommendation (next best action)
└─ LearningEvent (analytics)
```

---

## 4. Content Schema

All educational content is versioned as YAML in Git.

### Skill

```yaml
id: mathematics.calculus.derivatives
version: 1
subject: mathematics-ii
region: catalunya
academic_year: 2026

name:
  ca: Derivades
  es: Derivadas

parent: mathematics.calculus
prerequisites:
  - mathematics.algebra.functions

related:
  - mathematics.calculus.integrals

competencies:
  - reasoning
  - problem_solving

status: published
```

### Question

```yaml
id: mat2-2026-000001
version: 1
region: catalunya
academic_year: 2026
subject: mathematics-ii

type: multiple_choice
skills:
  - mathematics.calculus.derivatives

difficulty:
  initial: 0.55
  calibrated: null

question:
  ca: "..."
  es: "..."

options:
  - id: A
    ca: "..."
  - id: B
    ca: "..."

answer:
  type: single
  correct: B

explanation:
  ca: "..."
  es: "..."

source:
  type: official
  authority: Canal Universitats
  exam_year: 2026
  exam_id: mathematics-2026-june
  url: "https://..."

review:
  status: approved
  reviewed_by: null
  reviewed_at: null
```

### Degree (University/Goal)

```yaml
id: upc-ingenieria-informatica
university_id: upc
name:
  ca: Enginyeria Informàtica
  es: Ingeniería Informática

admission_score_max: 14

weightings:
  - subject: mathematics-ii
    coefficient: 0.2
  - subject: physics
    coefficient: 0.2
```

---

## 5. API Contract (REST)

### Catalog Endpoints

```
GET /v1/catalog/subjects
GET /v1/catalog/skills
GET /v1/catalog/universities
GET /v1/catalog/degrees/:id
GET /v1/questions/:id
```

### Student & Goal Flow

```
POST /v1/students              # anonymous session
GET /v1/students/:id

POST /v1/goals                 # select university + degree
GET /v1/goals/:id
PATCH /v1/goals/:id           # change target
```

### Assessment (Diagnostic)

```
POST /v1/assessments           # start diagnostic
GET /v1/assessments/:id
POST /v1/assessments/:id/responses    # submit answer
POST /v1/assessments/:id/complete     # finish
```

### Skill State

```
GET /v1/students/:id/skills    # current mastery estimates
GET /v1/students/:id/recommendations  # next best actions
```

### Practice Sessions

```
POST /v1/students/:id/sessions       # start session
POST /v1/sessions/:id/responses      # submit answer
POST /v1/sessions/:id/complete       # end session
```

### Admin

```
GET /v1/admin/reviews
POST /v1/admin/reviews/:id/approve
POST /v1/admin/reviews/:id/reject
PATCH /v1/admin/questions/:id
```

---

## 6. Database Schema (PostgreSQL)

Core tables (created via Prisma):

- `students` — anonymous or registered users
- `student_goals` — target degree per student
- `assessments` — diagnostic tests
- `assessment_responses` — individual answers
- `student_skill_states` — mastery probabilities
- `practice_sessions` — training sessions
- `session_responses` — session answers
- `recommendations` — next best actions
- `learning_events` — analytics

Content tables (read from import):
- `skills` — ingested from Git
- `questions` — ingested from Git
- `degrees` — ingested from Git
- `weightings` — ingested from Git
- `cutoffs` — ingested from Git

---

## 7. Week 1–2 Deliverables

Week 1 (Foundation):

- [x] Monorepo structure
- [x] TypeScript config and ESLint
- [x] Prisma schema (PostgreSQL)
- [x] Content schema validation (Zod types)
- [x] YAML/JSON content directory structure
- [x] Validation CLI (`pnpm validate-content`)
- [x] Seed pipeline (content importer)
- [x] CI (GitHub Actions: lint, typecheck, content validation, tests)
- [x] README + architecture doc
- [x] `pnpm test`, `pnpm lint`, `pnpm validate-content` all pass

Week 2 (Knowledge Model):

- [x] 44-skill Matemàtiques II graph across the 4 PAU blocks
- [x] Prerequisite DAG with cycle detection in CI
- [x] Question schema + provenance enforcement
- [x] Controlled source registry (`content/sources/registry.yaml`)
- [x] Content importer verified end-to-end against Postgres (idempotent)
- [x] 12 honestly-provenanced community practice questions

Week 3 (Assessment): `@pau/scoring` (Bayesian mastery), `@pau/knowledge-model`
(profile/level/recommendation), `@pau/assessment` (adaptive diagnostic),
`@pau/api` diagnostic endpoints + analytics; 30 questions.

Week 4 (Student Experience): `@pau/api-client`, Expo app (`@pau/mobile`) with the
full screen flow, minimal practice with feedback, goals/catalog endpoints.

Week 5 (University Goal Engine): universities/degrees/weightings/cutoffs content
(provisional, non-official), `@pau/scoring` admission module (specific-phase
contribution + `buildTargetRelevance`), DB-backed catalog + degree detail +
`/target-estimate`, and `target_relevance` wired into diagnostic selection.
The full 14-point admission score is intentionally **not** predicted (no grades
/ 2nd subject); cutoffs are context only, never required scores (spec §4/§13).

---

## 7a. Toolchain / ORM Addendum (2026-08-11)

- **Node 22 (LTS).** Pinned via `.nvmrc`. Node 18 was removed; the broken
  Homebrew `node@16` keg was uninstalled so a fresh shell resolves the working
  `node@22`. Latest Prisma requires Node ≥ 20.19 / 22.12 / 24.
- **Prisma 7 with driver adapters.** Prisma 7 no longer accepts `url` in
  `schema.prisma`. The migration connection URL lives in `prisma.config.ts`
  (`env('DATABASE_URL')`); the runtime client is instantiated with the
  `@prisma/adapter-pg` PostgreSQL driver adapter. The client is generated by
  the new `prisma-client` generator (ESM, Node runtime) into
  `prisma/generated/client` (git-ignored, regenerated via `pnpm db:generate`).
- **Local Postgres via Docker** on port 5433 (`docker-compose.yml`) to avoid
  colliding with other local Postgres instances.
- **Content layout.** Skills are authored as a single array `skills.yaml`
  per subject (spec §15); questions live as individual or grouped array files
  under `questions/{official,community,generated}/`. The loader accepts both a
  single object and an array per file.
- **Provenance integrity.** No question is marked `official` without a verified
  imported artifact and human review. Agent-authored practice items are
  `community` / `pending_review`.

---

## 8. Assumptions & Open Questions

### Content & Licensing

**Question:** Can we legally ingest and redistribute official Canal Universitats material (2026 exam, cutoff data)?
- **Assumption:** Yes, with proper attribution and provenance marked
- **Action:** Verify with AGPL/CC license analysis before first ingestion

**Question:** Which official sources are the authoritative ingestion targets?
- **Assumption:** Canal Universitats website provides curricula, exams, cutoffs, degree catalogues
- **Action:** Document exact URLs and retrieval logic in import scripts

### Privacy & Minors

**Question:** Do we need parental consent / COPPA compliance for v0.1 pilot?
- **Assumption:** Not for anonymous diagnostic; required before collecting persistent accounts
- **Action:** Legal review before Week 4 (student experience) rolls out persistent logins

### Authentication

**Question:** Should we use a managed auth provider (Firebase, Auth0) or email-based?
- **Assumption:** Email-based for v0.1; opt-in after diagnostic
- **Action:** Deferred to Week 4; use pseudonymous sessions until then

### Infrastructure

**Question:** Where do we host initially?
- **Assumption:** Docker + cloud run or similar simple deployment
- **Action:** Defer to Week 4 pilot; use local dev environment for now

---

## 9. Execution Flow (Week 1 → Week 8)

| Week | Phase | Outputs |
|------|-------|---------|
| 1 | Foundation | Monorepo, CI, schema, seed pipeline, 30–50 skill graph |
| 2 | Knowledge Model | Skill prerequisites, question provenance, content validation |
| 3 | Assessment | Diagnostic flow, adaptive selection, 20–30 questions, skill updates |
| 4 | Student Experience | Onboarding, goals, home, practice, progress (end-to-end) |
| 5 | University Goals | Degrees, weightings, cutoffs, goal prioritization |
| 6 | Adaptive Practice | Next Best Action, spaced retrieval, session composition, explanations |
| 7 | Pilot | 50 real students, retention metrics, interviews |
| 8 | Learning Validation | Pre/post assessment, learning gain measurement, expand decision |

---

## 10. Next: Week 1 Implementation

1. Complete tsconfig, ESLint setup
2. Implement Prisma schema
3. Create content schema types + validation
4. Set up YAML loading + CI schema validator
5. Write seed script (stub dataset)
6. Create README
7. All tests passing
