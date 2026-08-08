# Specification discrepancies identified during Phase 0

The read-only handoff files were not changed. The Coding Handoff Guide precedence rules were applied as follows.

## `GET /v1/me` response schema is absent from OpenAPI

The API prose says `GET /v1/me` returns “Profile + memberships,” but `04a_TurnTable_OpenAPI_3.1.yaml` has a 200 response with no content/schema. Phase 0 defines the smallest explicit `MeResponse` compatible with that prose: `{ user, memberships }`, using the baseline `User` fields and membership identifiers/role/status. The project-owned `phase0-contract-addendum.yaml` freezes that clarification without changing the read-only handoff package, and the OpenAPI compatibility check now verifies both the response reference and its component schemas.

## Ownership transfer and member removal are absent from OpenAPI

The normative API prose and acceptance criteria require ownership transfer and historical member removal, while `04a_TurnTable_OpenAPI_3.1.yaml` omits both paths. Phase 1 implements both capabilities and records the corrected request/response schemas in `phase1-contract-addendum.yaml`. ADR-006 documents the precedence decision, and the compatibility check treats the addendum as the baseline only for these two omitted operations.

## Overdue persistence

The Prisma baseline includes `OVERDUE` in `OccurrenceStatus`. Business rules, the Data Model narrative, OpenAPI, acceptance criteria, and Analytics Specification all define overdue as derived (`SCHEDULED && due_at < now`) and explicitly say no stored transition is required. The implementation schema omits `OVERDUE` and preserves derived semantics.

## Prisma nullability/version omissions

The Prisma baseline makes `TaskOccurrence.dueAt` and `SwapRequest.expiresAt` nullable, while the normative Data Model and API schemas require both. The implementation makes both non-null. The Data Model also requires a concurrency `version` on `household_memberships`, which the baseline omits; the implementation adds it.

## Expense category constraint

The Prisma baseline stores `Expense.category` as a free string, while Business Rules define a fixed MVP category set and the Data Model requires constrained category values. The implementation uses a PostgreSQL enum generated from that fixed set.

These choices tighten the machine-readable implementation toward higher-precedence business/persistence/API semantics without changing the reference package.
