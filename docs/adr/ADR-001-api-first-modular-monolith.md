# ADR-001: API-first modular monolith

## Context

Household membership, responsibility assignment, swaps, expenses, and settlements share transactional invariants. Web and mobile need one client-agnostic business boundary.

## Decision

Use one pnpm monorepo containing an independently deployable NestJS API and worker. Keep domain modules inside an API-first modular monolith. Web and mobile consume the REST API; Next.js is not a second business backend.

## Consequences

Cross-domain ACID transactions remain straightforward and operational complexity stays low. Module boundaries must be enforced in code so later extraction remains possible if measured scaling or ownership pressure emerges.
