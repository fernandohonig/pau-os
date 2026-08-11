# PAU OS v0.1

Open-source academic GPS for Spanish PAU preparation.

**MVP Goal:** A student in Catalunya studying 2º Bachillerato can select a real university degree, complete a 15–20 minute Matemàtiques II diagnostic, and receive a useful, explainable recommendation for what to study next.

## Development Status

**Week 1: Foundation** — ✅ complete
**Week 2: Knowledge Model** — ✅ complete
**Week 3: Assessment** — ✅ complete
**Week 4: Student Experience** — ✅ complete
**Week 5: University Goal Engine** — ✅ complete
**Week 6: Adaptive Practice** — ✅ complete
**Weeks 7–8: Pilot & Learning Validation** — ✅ complete (code); pilot is operational

- [x] Repository structure (pnpm workspaces + Turbo)
- [x] Content schema & validation (Zod)
- [x] Prisma 7 schema + PostgreSQL migrations
- [x] 44-skill Matemàtiques II graph (4 PAU blocks), DAG-validated
- [x] Content importer (YAML → PostgreSQL), idempotent
- [x] Controlled source registry
- [x] Bayesian mastery engine (`@pau/scoring`)
- [x] Knowledge model: profile, gaps/strengths, level estimate (`@pau/knowledge-model`)
- [x] Adaptive diagnostic (`@pau/assessment`)
- [x] Diagnostic REST API (`@pau/api`) with analytics events — see [docs/api.md](docs/api.md)
- [x] 30 practice questions (≥2 per core skill) for a meaningful diagnostic
- [x] Typed API client (`@pau/api-client`), integration-tested against the live API
- [x] Web app (`@pau/web`, Vite + React + Tailwind): Welcome → Goal → Diagnostic → Results → Home → Practice → Progress (responsive, light/dark)
- [x] Minimal practice flow (immediate feedback + explanation) + goals/catalog endpoints
- [x] University goal engine: universities/degrees/weightings/cutoffs (provisional), goal scoring
- [x] Honest target estimate: subject level → specific-phase contribution (no fake 14-pt prediction)
- [x] `target_relevance` wired into diagnostic selection (spec §12 hook)
- [x] Next Best Action engine (`@pau/recommendation`): §12 priority + reason codes
- [x] Session composer (§14): mixed 15-min sessions; adaptive practice sessions API
- [x] Live NBA recommendations; app Practice now runs composed sessions
- [x] Learning-gain metrics (`@pau/metrics`): gain, **Gain/Hour** (primary metric), retention, cohort summary
- [x] Full §22 analytics events; `GET /v1/admin/metrics/summary`; `GET /v1/students/:id/learning-gain`
- [x] Right to erasure (`DELETE /v1/students/:id`); privacy posture ([docs/privacy.md](docs/privacy.md))
- [x] MVP acceptance criteria tracked ([docs/acceptance.md](docs/acceptance.md))
- [x] Auth: anonymous-first students, optional Google sign-in, admin email allowlist, dev login ([docs/auth.md](docs/auth.md))
- [x] CI/CD (lint, typecheck, web typecheck, content validation, unit + integration tests)

> ⚠️ **Provisional university data.** Degree weightings and cut-offs under
> `content/universities/` are **placeholders**, not official Canal Universitats
> data, and are marked `estimated`/provisional throughout. They must be replaced
> by verified official import before any real use (spec §35).

### Run the full stack locally

```bash
# 1. Database + API
docker compose up -d && pnpm db:migrate:dev && pnpm db:seed
npx tsx services/api/src/server.ts       # → http://localhost:3000

# 2. The web app, in another terminal
pnpm --filter @pau/web dev               # → http://localhost:5173
# Config: apps/web/.env.local (VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID)
```

**Test as a student and as an admin** (no Google setup needed): the sign-in
screen shows, in dev builds, a *Developer sign-in* card:
- **Start — no account needed** → the anonymous student journey.
- **Dev login as admin** → the admin dashboard (pilot metrics).

For real Google sign-in and the admin allowlist, see [docs/auth.md](docs/auth.md).
Dev login is disabled in production.

The screens call the API via `apps/web/src/api.ts`, whose endpoints are the same
ones covered by the `@pau/api-client` integration test. The app typechecks and
builds (`pnpm --filter @pau/web build`), is responsive (mobile → desktop), and
supports light/dark themes.

## Getting Started

### Prerequisites

- Node.js 22+ (see `.nvmrc`; `nvm use`)
- pnpm 9+ (via `corepack enable`)
- Docker (for the local Postgres in `docker-compose.yml`)

### Setup

```bash
# Use the pinned Node version and install deps
nvm use
pnpm install

# Environment
cp .env.example .env

# Start local Postgres (port 5433) and generate the Prisma client
docker compose up -d
pnpm db:generate

# Apply migrations and seed content from Git
pnpm db:migrate:dev
pnpm db:seed        # imports validated YAML content into Postgres
```

### Development

```bash
pnpm validate-content   # validate all YAML content + references
pnpm typecheck          # TypeScript project-wide
pnpm test               # unit tests
pnpm lint               # ESLint
```

## Directory Structure

```
pau-os/
├── apps/
│   └── web/             # Vite + React + Tailwind web app (incl. admin)
├── packages/
│   ├── content-schema/  # YAML schema & validation
│   ├── assessment/      # Diagnostic & session logic
│   ├── knowledge-model/ # Skill graph & updates
│   ├── recommendation/  # Next best action
│   ├── scoring/         # Assessment scoring
│   └── api-client/      # API client library
├── services/
│   └── api/             # Fastify API server
├── content/
│   └── catalunya/
│       └── 2026/
│           └── mathematics-ii/
│               ├── skills/          # YAML
│               ├── questions/       # YAML
│               ├── exams/
│               └── rubrics/
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── scripts/
│   ├── validate-content.js
│   └── import-content.js
├── docs/
│   └── architecture.md
└── README.md
```

## Content Format

All educational content is defined in Git as YAML and validated by CI.

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

prerequisites:
  - mathematics.functions

status: published
```

### Question

```yaml
id: mat2-2026-000001
version: 1
region: catalunya
subject: mathematics-ii
skills:
  - mathematics.calculus.derivatives

type: multiple_choice
difficulty:
  initial: 0.55

question:
  ca: "..."
options:
  - id: A
    ca: "Option A"
answer:
  type: single
  correct: A

explanation:
  ca: "..."

source:
  type: official
  authority: Canal Universitats
  url: null

review:
  status: approved
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for full system design.

### High-Level Flow

```
Student selects goal
    ↓
Diagnostic (20–30 adaptive questions)
    ↓
Skill state updated via Bayesian model
    ↓
Recommendation engine suggests next action
    ↓
Practice session
    ↓
Progress dashboard
```

## Key Principles

1. **Goal first.** The student's desired degree drives prioritization.
2. **One next action.** Never overwhelm with a catalog.
3. **Evidence over confidence.** Infer mastery from performance.
4. **Official content distinguishable.** Mark provenance clearly.
5. **Open by default.** Community contributions via pull requests.
6. **Privacy by design.** Minimal personal data, especially for minors.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (TBD).

## License

[AGPL-3.0](LICENSE)

## References

- [Product & Technical Spec](PAU_OS_Product_Technical_Spec_v0.1.md)
- [Architecture](docs/architecture.md)
- [Canal Universitats](https://www.universitats.gencat.cat/)
