# TurnTable

TurnTable is an API-first shared-household coordination platform for recurring responsibilities, swaps/covers, shared expenses, settlements, notifications, and explainable analytics. This repository implements **Phase 0: Engineering Foundation** and **Phase 1: Household, Membership, Invitation, Ownership, and Household Authorization**.

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

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed # optional deterministic Phase 1 local fixtures
pnpm dev
```

The API listens on `http://localhost:3000`. Swagger UI is at `http://localhost:3000/docs`, the runtime OpenAPI JSON is at `http://localhost:3000/docs/openapi.json`, and the local Keycloak admin console is at `http://localhost:8080/admin/`.

## Environment configuration

Required application settings are documented in `.env.example`. Startup fails with a targeted configuration error when required values are absent.

If ports 5432, 6379, or 8080 are already occupied, change `POSTGRES_PORT`, `REDIS_PORT`, or `KEYCLOAK_PORT` and update dependent URLs before starting Compose.

Self-hosted Keycloak is the reference identity provider. Local Compose imports the `turntable` realm and `.env.example` points the API at `http://localhost:8080/realms/turntable`. Production/staging use the public HTTPS Keycloak issuer and an environment-specific audience. TurnTable has no custom username/password implementation and imports no Keycloak SDK into business modules; it validates standard OIDC/JWT discovery, JWKS, issuer, audience, expiration, and subject claims.

Local/test may explicitly fall back to `AUTH_MODE=development` with an HS256 secret of at least 32 characters; the API rejects this mode outside `APP_ENV=local|test`. `INVITATION_TOKEN_SECRET` is a distinct 32+ character deployment secret used to derive opaque, retry-stable invitation tokens; keep it stable and never expose it to clients.

Verify local Keycloak discovery and signing keys:

```bash
pnpm auth:oidc:check
```

For a real user flow, start the API, run `pnpm auth:oidc:verify`, and open the printed login URL. The command completes Authorization Code with PKCE, validates the token, and calls `GET /v1/me` without printing or persisting the raw bearer token. The first authenticated request creates the local `User` projection keyed by the external subject.

For offline/test-only synthetic authentication, switch `AUTH_MODE=development`, load `.env`, and use `pnpm --filter @turntable/api auth:dev-token`. Multi-user testing may set `DEV_TOKEN_SUBJECT`, `DEV_TOKEN_EMAIL`, and `DEV_TOKEN_NAME`; these options affect only that local generator.

## Self-hosted Keycloak

Local Compose adds pinned Keycloak 26.7.0 plus an isolated PostgreSQL 18 service. The committed realm contains no users and defines:

- confidential `turntable-web` with Authorization Code and PKCE S256;
- public `turntable-mobile` with Authorization Code and PKCE S256;
- bearer-only `turntable-api` with login and service-account flows disabled;
- the local API audience `urn:turntable:api:local` on user access tokens.

Local Keycloak uses `start-dev`; it is not a production deployment template. See `docs/runbooks/keycloak.md` for HTTPS, database, SMTP, backup, monitoring, scaling, and realm-change requirements. The provider decision and original-plan delta are recorded in ADR-008 and `docs/architecture/keycloak-plan-delta.md`; local verification evidence is in `docs/runbooks/keycloak-verification.md`.

## Database commands

```bash
pnpm db:generate       # regenerate Prisma Client
pnpm db:migrate        # apply committed migrations
pnpm db:migrate:dev    # create/develop a migration locally
pnpm db:reset          # destructive local reset; prompts for confirmation
pnpm db:seed           # deterministic local/test Phase 1 fixtures
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

Filtered development commands require the variables from `.env` to already be exported. The root `pnpm dev` command loads `.env` automatically.

## Phase 1 household API

Implemented authenticated endpoints:

```text
GET    /v1/me
POST   /v1/households
GET    /v1/households
GET    /v1/households/{householdId}
PATCH  /v1/households/{householdId}
GET    /v1/households/{householdId}/members
POST   /v1/households/{householdId}/invitations
POST   /v1/invitations/{token}/accept
POST   /v1/households/{householdId}/ownership-transfer
DELETE /v1/households/{householdId}/members/{memberId}
```

Household reads require an ACTIVE membership; settings, invitations, removal, and ownership transfer enforce OWNER rules in reusable application authorization services. Member listing returns active members by default. LEFT/REMOVED memberships remain in PostgreSQL for historical references but do not authorize current access.

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

The first command writes `docs/api/openapi.generated.json` from implemented NestJS controllers and regenerates `packages/api-client/src/generated/schema.d.ts`. The second fails when generation leaves an uncommitted contract/client diff. The broader normative baseline remains `TurnTable_Coding_Handoff_Package/04a_TurnTable_OpenAPI_3.1.yaml`; only implemented operations are generated. The project-owned `docs/api/phase0-contract-addendum.yaml` freezes the otherwise unspecified `GET /me` response. `docs/api/phase1-contract-addendum.yaml` corrects the handoff OpenAPI omission of ownership transfer and member removal. Both are enforced by the compatibility check.

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

Both images use Node.js 24, multi-stage builds, explicit commands, and a non-root runtime user. PostgreSQL, Redis, and Keycloak are external services and are never embedded in these images.

## Troubleshooting

- `Invalid TurnTable configuration`: compare `.env` with `.env.example`; all required values must be present.
- `/health/ready` returns 503: confirm `docker compose ps`, then run `pnpm db:migrate`.
- Integration tests cannot find Docker: start Docker Desktop/Engine and rerun `pnpm test:integration`.
- `/v1/me` returns 401 locally: run `pnpm auth:oidc:check`, then use `pnpm auth:oidc:verify` to obtain and validate a real Keycloak user token.
- Keycloak discovery fails: run `docker compose ps`; the configured issuer must exactly equal the discovery document's issuer.
- Keycloak realm changes do not appear: startup import intentionally skips an existing realm; follow `docs/runbooks/keycloak.md` rather than deleting application data casually.
- Prisma client import/build errors: run `pnpm db:generate`.
- Stale generated contract: run `pnpm openapi:generate` and commit both generated artifacts.

Known specification mismatches and their selected interpretations are recorded in `docs/api/specification-discrepancies.md`. Phase 0 validation is recorded in `docs/runbooks/phase-0-verification.md`; Phase 1 evidence is recorded in `docs/runbooks/phase-1-verification.md`.
