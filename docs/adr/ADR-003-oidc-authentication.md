# ADR-003: OIDC authentication architecture

## Context

TurnTable needs standards-based authentication across mobile, web, and API without owning passwords or provider-specific business logic.

## Decision

Validate managed-provider OIDC bearer tokens at an adapter boundary and map the stable external subject to a local `User`. Use Authorization Code + PKCE in clients. Permit an isolated signed-token verifier only in local/test environments.

## Consequences

Identity providers can change without rewriting domain modules. Production requires issuer/audience/JWKS validation. Household authorization remains a separate membership/object-level concern for Phase 1.
