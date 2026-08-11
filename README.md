# PAU OS v0.1

Open-source academic GPS for Spanish PAU preparation.

**MVP Goal:** A student in Catalunya studying 2º Bachillerato can select a real university degree, complete a 15–20 minute Matemàtiques II diagnostic, and receive a useful, explainable recommendation for what to study next.

## Development Status

**Week 1: Foundation** — ✅ complete
**Week 2: Knowledge Model** — ✅ complete
**Week 3: Assessment** — ✅ complete
**Week 4: Student Experience** — ✅ complete

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
- [x] Expo app (`@pau/mobile`): Welcome → Goal → Diagnostic → Results → Home → Practice → Progress
- [x] Minimal practice flow (immediate feedback + explanation) + goals/catalog endpoints
- [x] CI/CD (lint, typecheck, mobile typecheck, content validation, unit + integration tests)
- [ ] University goal engine — degrees/weightings/cutoffs (Week 5)

### Run the full stack locally

```bash
# 1. Database + API
docker compose up -d && pnpm db:migrate:dev && pnpm db:seed
npx tsx services/api/src/server.ts       # → http://localhost:3000

# 2. The app (web), in another terminal
pnpm --filter @pau/mobile web            # Expo web dev server
# API base URL: app.json → expo.extra.apiBaseUrl (default http://localhost:3000)
```

The screens call the API via `apps/mobile/src/api.ts`, whose endpoints are the
same ones covered by the `@pau/api-client` integration test. The app is verified
to typecheck and bundle for web (Metro), and its API contract is tested
end-to-end; on-device rendering/UX polish comes later (spec §29 step 17).

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
│   ├── mobile/          # React Native + Expo
│   ├── web/             # Web frontend
│   └── admin/           # Admin UI
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
