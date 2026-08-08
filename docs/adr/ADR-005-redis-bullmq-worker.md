# ADR-005: Redis and BullMQ worker architecture

## Context

Reminders, notification delivery, retries, and future analytics rollups need a separately scalable asynchronous runtime, while durable intent must survive Redis loss.

## Decision

Run a separately deployable NestJS worker using BullMQ over Redis. Future business transactions write activity and outbox rows atomically in PostgreSQL; the worker claims outbox work idempotently and revalidates mutable state before external side effects.

## Consequences

API latency is isolated from external delivery work and worker concurrency scales independently. Redis remains operational queue state, so durable obligations must be reconstructible from PostgreSQL.
