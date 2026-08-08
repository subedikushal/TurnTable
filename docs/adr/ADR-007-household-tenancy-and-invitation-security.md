# ADR-007: Household tenancy and invitation security boundary

## Status

Accepted — 2026-08-08

## Context

Every later TurnTable aggregate belongs to a household. Phase 1 therefore needs a reusable current-membership boundary, an owner invariant that survives races, and invitation tokens that can be replayed idempotently without persisting raw token material.

## Decision

- Application services use `HouseholdAuthorizationService` to resolve ACTIVE membership or require the OWNER role before household-scoped reads and mutations.
- Repository queries include `household_id` context before returning protected data. Bare resource identifiers are never treated as authorization capabilities.
- LEFT and REMOVED membership rows remain immutable historical identities for prior records but do not authorize current access or appear in default current-member lists.
- PostgreSQL retains the partial unique active-owner index and adds a deferred constraint trigger requiring exactly one ACTIVE OWNER at transaction commit. Transfer locks the household, demotes the current owner, promotes one ACTIVE MEMBER, and commits atomically.
- Invitations persist only SHA-256 token hashes. The raw opaque token is a 256-bit HMAC output derived from a distinct server secret plus the authenticated actor, operation, idempotency key, and normalized request hash. This cryptographic derivation makes the same logical retry reconstruct the same token without persisting or logging it.
- Retry-sensitive commands acquire a transaction-scoped PostgreSQL advisory lock for the authenticated user, operation, and idempotency key. The normalized request hash and terminal response are stored in the existing idempotency table in the same transaction as business, activity, and outbox state.

## Consequences

- Later modules can reuse active-member and owner checks without duplicating controller policy.
- Invitation creation can return the original token on an idempotent retry while the database, audit events, outbox, and logs contain no raw token.
- `INVITATION_TOKEN_SECRET` is mandatory in every environment and must remain stable for at least the invitation lifetime plus idempotency retention. Rotation requires retaining the previous key until that window closes.
- Cross-household and removed-member denial is enforced and tested at the backend boundary independent of client behavior.
