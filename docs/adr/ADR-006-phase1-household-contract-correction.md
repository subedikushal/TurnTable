# ADR-006: Correct omitted Phase 1 household operations

## Status

Accepted — 2026-08-08

## Context

The normative API prose and acceptance criteria require ownership transfer and member removal, but the read-only handoff OpenAPI omits both operations. The API specification explicitly classifies prose/OpenAPI disagreement as a defect to resolve before implementation.

## Decision

The implementation contract includes:

- `POST /v1/households/{householdId}/ownership-transfer`
- `DELETE /v1/households/{householdId}/members/{memberId}`

Both are authenticated, OWNER-only, idempotent commands. Ownership transfer requires an ACTIVE MEMBER target and atomically demotes the old owner while promoting the new owner. Removal transitions an ACTIVE MEMBER to REMOVED without deleting history and rejects removal of the active owner.

The read-only handoff package remains unchanged. `docs/api/phase1-contract-addendum.yaml` is the versioned correction, the generated NestJS OpenAPI is the implemented client contract, and `openapi:compat` verifies the corrected operations and schemas.

## Consequences

- Generated web/mobile clients receive both required MVP operations.
- The correction is explicit and reviewable instead of silently diverging from the handoff OpenAPI.
- The Phase 1 PostgreSQL migration adds a deferred constraint trigger so every committed household state has exactly one ACTIVE OWNER.
