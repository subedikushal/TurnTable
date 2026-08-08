# Phase 0 closure verification

Verified on 2026-08-08 against base commit `e484908` plus the project-level closure changes described below. The read-only `TurnTable_Coding_Handoff_Package/` was not modified.

## Closure changes

- Root `pnpm dev` loads `.env`, passes the documented runtime variables through Turbo, and builds workspace dependencies before starting the API and worker.
- `.env.example` defaults to development authentication for local startup while retaining the production/staging OIDC requirement.
- TypeScript configs use `NodeNext` resolution without deprecated `node10` or `baseUrl` settings; affected relative dynamic imports use explicit `.js` specifiers.
- `docs/api/phase0-contract-addendum.yaml` freezes the previously unspecified `GET /me` response. `openapi:compat` verifies its response reference and component schemas alongside the read-only normative baseline.
- The advanced CodeQL workflow is Prettier-formatted; its behavior is unchanged.

## Local quality gates

The following commands passed under Node.js 24.19.0 and pnpm 11.16.0:

```text
pnpm install --frozen-lockfile --offline
pnpm peers check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm openapi:check
pnpm db:migrate
```

The migration replay found one migration and no pending migrations. Integration tests used real PostgreSQL 18 and Redis 8 containers.

## Clean-start runtime verification

All existing `apps/*/dist` and `packages/*/dist` directories were moved out of the repository before running the documented root command. `pnpm dev` rebuilt the required workspace packages and started both applications without manually building packages or sourcing `.env`.

- `GET /health/live`: `200`
- `GET /health/ready`: `200`, with database, migration history, and Redis checks up
- unauthenticated `GET /v1/me`: `401` problem details with `AUTH_REQUIRED`
- development-token `GET /v1/me`: `200` with `{ user, memberships }`
- `pnpm --filter @turntable/worker probe`: completed a BullMQ round trip

PostgreSQL and Redis remained healthy in Docker Compose after verification.

## Production images

Both images built successfully:

```text
docker build -f apps/api/Dockerfile -t turntable-api:phase0-final .
docker build -f apps/worker/Dockerfile -t turntable-worker:phase0-final .
```

Image inspection confirmed both run as user `turntable` with command `node dist/main.js`.

## Hosted checks and deployment boundary

The repository owner confirmed all GitHub-hosted checks passed on 2026-08-08, including the advanced CodeQL workflow. GitHub code scanning must continue to use either default setup or this advanced workflow, not both simultaneously.

A live production OIDC issuer was not available for this local verification. That is a deployment credential/configuration prerequisite rather than an unfinished Phase 0 implementation; production or staging must provide valid issuer and audience values and set `AUTH_MODE=oidc`.
