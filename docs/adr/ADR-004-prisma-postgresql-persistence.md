# ADR-004: Prisma and PostgreSQL persistence baseline

## Context

Assignments, money, idempotency, audit history, and outbox durability require relational constraints and transactions.

## Decision

Use PostgreSQL 18 as the source of truth and Prisma ORM 7 with its PostgreSQL driver adapter. Preserve integer minor-unit money, UTC instants/IANA zones, lifecycle states, version columns, idempotency records, activity events, and outbox events. Add reviewed SQL constraints where Prisma cannot express them.

## Consequences

Migrations are inspected and tested on clean databases. Prisma types are server-internal and are never exposed as client contracts. Redis cannot become authoritative business storage.
