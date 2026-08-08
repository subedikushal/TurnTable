# Phase 1 closure verification

Verified on 2026-08-08 against base commit `372373a` plus the uncommitted Phase 1 implementation described below. The read-only `TurnTable_Coding_Handoff_Package/` was not modified.

## Implemented vertical slice

- Household creation, listing, detail, and owner-controlled settings updates.
- Active membership listing and household-scoped authorization.
- Invitation creation and acceptance with hash-only token persistence, expiration, revocation, optional email binding, and replay-safe responses.
- Owner-controlled member removal and ownership transfer.
- Exactly one ACTIVE OWNER per household, enforced by a partial unique index and deferred PostgreSQL constraint triggers.
- Transactional activity, outbox, optimistic-concurrency, and reusable idempotency behavior.
- Deterministic local/test fixtures for multiple households, roles, membership states, and invitation states.

## API surface

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

## Contract correction

The handoff prose and acceptance criteria require ownership transfer and member removal, but the normative OpenAPI file omits those two operations. `docs/api/phase1-contract-addendum.yaml` supplies their exact project-owned contract without modifying the handoff package. `pnpm openapi:check` validates implemented operations against the normative baseline plus the Phase 0 and Phase 1 addenda. The decision and discrepancy are recorded in ADR-006 and `docs/api/specification-discrepancies.md`.

## Acceptance and concurrency evidence

- **AC-HH-001:** concurrent household creation with the same idempotency key returns the same response and creates one household, owner membership, activity set, outbox message, and idempotency record.
- **AC-HH-002:** owner invitation creation and authenticated acceptance create one ACTIVE MEMBER; only the token hash is stored, and exact retries replay safely.
- **AC-HH-003:** ACTIVE members can read household state while non-owners cannot update settings, invite, remove members, or transfer ownership; outsiders and historical memberships cannot access the household.
- **AC-HH-004:** owners cannot remove themselves while still owner; ownership can transfer only to an ACTIVE member, leaves exactly one ACTIVE OWNER, and is replay-safe.
- **AC-HH-005:** removal preserves historical membership with `REMOVED` status and `left_at`, immediately revokes authorization, and emits its activity/outbox effects once.

Concurrent invitation acceptance and ownership transfer tests lock the relevant rows and verify one winning transition, conflict responses for losing requests, and exactly-once database effects. Database integration tests also prove that transactions cannot commit with zero or two ACTIVE owners.

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
pnpm db:seed
```

The final integration run passed four API test files with 20 tests plus the worker Redis integration test. It used real PostgreSQL 18 and Redis 8 containers. The migration-upgrade test applied the Phase 0 baseline, inserted valid Phase 0 data, applied both Phase 1 migrations, and verified the preserved owner invariant. Local migration replay found three migrations and no pending migrations. Running the deterministic seed again completed successfully.

## Runtime verification

The API and worker started through the documented root development command. PostgreSQL and Redis were healthy, and `GET /health/ready` returned `200` with database, migration, and Redis checks up.

An authenticated multi-user HTTP flow verified:

- household creation, member listing, invitation creation, and invitation acceptance: `200`;
- active-member household read: `200`;
- member settings update and invitation creation: `403`;
- outsider household read: `403`;
- ownership transfer and former-owner removal: `200`;
- removed-member household read: `403`.

The final database state for that household had one ACTIVE OWNER and one REMOVED historical member.

## Production images

Both Phase 1 images built successfully:

```text
docker build -f apps/api/Dockerfile -t turntable-api:phase1 .
docker build -f apps/worker/Dockerfile -t turntable-worker:phase1 .
```

Image inspection confirmed both run as user `turntable` with command `node dist/main.js`.

## Deployment boundary

A live production OIDC issuer was not available for local verification. Staging or production must set `AUTH_MODE=oidc`, provide valid issuer/audience values, and provide a stable deployment-specific `INVITATION_TOKEN_SECRET`. Phase 1 GitHub-hosted checks will run only after these changes are committed and pushed.
