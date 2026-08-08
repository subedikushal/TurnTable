# TurnTable

TurnTable is an API-first shared-household coordination platform for recurring responsibilities, swaps/covers, shared expenses, settlements, notifications, and explainable analytics. This repository currently implements **Phase 0: Engineering Foundation** only.

The normative specifications are under `TurnTable_Coding_Handoff_Package/`. They are read-only reference artifacts and must not be edited.

## Architecture

TurnTable is a pnpm/Turborepo monorepo containing independently deployable applications:

- `apps/api`: NestJS 11 REST API using Fastify.
- `apps/worker`: NestJS standalone process using Redis and BullMQ.
- `apps/web`: reserved for Next.js 16.3 (no Phase 0 UI).
- `apps/mobile`: reserved for Expo SDK 57 / React Native 0.86 (no Phase 0 UI).
- `packages/api-client`: generated OpenAPI TypeScript types plus a typed fetch client.
- `packages/observability`: shared structured logging and OpenTelemetry bootstrap.

PostgreSQL is authoritative business storage. Redis is transient queue/cache infrastructure only. Clients consume the REST/OpenAPI contract and never Prisma entities.

## Prerequisites

- Node.js 24 LTS
- Corepack and pnpm 11
- Docker Engine or Docker Desktop
- Git
- A standards-compliant OIDC application for non-local environments

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

The API listens on `http://localhost:3000`. Swagger UI is at `http://localhost:3000/docs`, and the runtime OpenAPI JSON is at `http://localhost:3000/docs/openapi.json`.

## Environment configuration

Required application settings are documented in `.env.example`. Startup fails with a targeted configuration error when required values are absent.

If ports 5432 or 6379 are already occupied, change `POSTGRES_PORT`/`REDIS_PORT` and update the corresponding `DATABASE_URL`/`REDIS_URL` values before starting Compose.

Production/staging use `AUTH_MODE=oidc`, `OIDC_ISSUER_URL`, and `OIDC_AUDIENCE`. No custom username/password authentication exists. Local/test may use `AUTH_MODE=development` with an HS256 secret of at least 32 characters; the API rejects this mode outside `APP_ENV=local|test`.

Generate a local bearer token after loading `.env`:

```bash
set -a && source .env && set +a
pnpm --filter @turntable/api auth:dev-token
```

Use the output as `Authorization: Bearer <token>` with `GET /v1/me`. The first authenticated request creates the local `User` projection keyed by the external subject.

## Database commands

```bash
pnpm db:generate       # regenerate Prisma Client
pnpm db:migrate        # apply committed migrations
pnpm db:migrate:dev    # create/develop a migration locally
pnpm db:reset          # destructive local reset; prompts for confirmation
```

Migration SQL includes database-only checks/partial indexes that Prisma schema syntax cannot express. Always inspect generated migration SQL.

## Development commands

```bash
pnpm dev                                  # API and worker in watch mode
pnpm --filter @turntable/api dev          # API only
pnpm --filter @turntable/worker dev       # worker only
pnpm --filter @turntable/worker probe     # enqueue a safe Redis/BullMQ probe
```

The worker may also prove round-trip queue handling on startup with `WORKER_PROBE_ON_START=true`.

## Quality and tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # real PostgreSQL 18 and Redis containers
pnpm build
pnpm format:check
```

Integration tests require a working Docker daemon. They intentionally use Testcontainers rather than in-memory persistence substitutes.

## OpenAPI and generated client

```bash
pnpm openapi:generate
pnpm openapi:check
```

The first command writes `docs/api/openapi.generated.json` from implemented NestJS controllers and regenerates `packages/api-client/src/generated/schema.d.ts`. The second fails when generation leaves an uncommitted contract/client diff. The broader normative baseline remains `TurnTable_Coding_Handoff_Package/04a_TurnTable_OpenAPI_3.1.yaml`; Phase 0 generates only implemented operations. The project-owned `docs/api/phase0-contract-addendum.yaml` freezes the otherwise unspecified `GET /me` response and is enforced by the compatibility check.

## Repository layout

```text
apps/
  api/             NestJS/Fastify API, Prisma schema/migrations, tests
  worker/          standalone NestJS/BullMQ worker
  web/             reserved client boundary
  mobile/          reserved client boundary
packages/
  api-client/      generated API types and typed client factory
  contracts/       genuinely stable cross-runtime constants only
  eslint-config/   shared lint policy
  observability/   logs and OpenTelemetry bootstrap
  test-utils/      cross-workspace test constants
  tsconfig/        strict TypeScript bases
infra/docker/      local infrastructure initialization
docs/adr/          architecture decision records
docs/api/          generated implemented contract and discrepancy notes
docs/runbooks/     operational/development guidance
```

## Containers

Build production-oriented images from the repository root:

```bash
docker build -f apps/api/Dockerfile -t turntable-api:local .
docker build -f apps/worker/Dockerfile -t turntable-worker:local .
```

Both images use Node.js 24, multi-stage builds, explicit commands, and a non-root runtime user. PostgreSQL and Redis are external services and are never embedded in these images.

## Troubleshooting

- `Invalid TurnTable configuration`: compare `.env` with `.env.example`; all required values must be present.
- `/health/ready` returns 503: confirm `docker compose ps`, then run `pnpm db:migrate`.
- Integration tests cannot find Docker: start Docker Desktop/Engine and rerun `pnpm test:integration`.
- `/v1/me` returns 401 locally: use development auth only with `APP_ENV=local`, a 32+ character `DEV_AUTH_SECRET`, and a newly generated token.
- Prisma client import/build errors: run `pnpm db:generate`.
- Stale generated contract: run `pnpm openapi:generate` and commit both generated artifacts.

Known specification mismatches and the selected Phase 0 interpretations are recorded in `docs/api/specification-discrepancies.md`. The completed local, integration, runtime, and image checks are recorded in `docs/runbooks/phase-0-verification.md`.
