# ADR-002: REST and OpenAPI contract strategy

## Context

Multiple clients need a stable, debuggable contract without sharing server/Prisma entities.

## Decision

Use versioned REST endpoints and OpenAPI 3.1. Generate TypeScript types/client support from the implemented API document and detect generated diffs in CI. Keep the supplied OpenAPI YAML as the normative feature baseline.

## Consequences

Clients compile against generated types rather than handwritten duplicates. Public contract changes require explicit review; generation tooling is part of the build discipline.
