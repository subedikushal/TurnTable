# ADR-008: Self-hosted Keycloak as the reference identity provider

## Status

Accepted — 2026-08-08

## Context

ADR-003 deliberately isolated OIDC from TurnTable business modules but assumed a managed production provider. A managed provider introduces active-user pricing and an external operational dependency. TurnTable needs web and native Authorization Code plus PKCE, JWT access tokens with stable subject and profile claims, public JWKS discovery, MFA/passkey growth, and a path to high availability without putting passwords in the TurnTable application database.

## Decision

- Use Apache-2.0 Keycloak as the project-owned reference OIDC provider while retaining the provider-neutral API verifier.
- Pin local development to `quay.io/keycloak/keycloak:26.7.0`; do not use floating image tags.
- Run local Keycloak with an isolated PostgreSQL 18 database and persistent volume. Keycloak data never shares TurnTable's Prisma schema or database credentials.
- Import a deterministic local `turntable` realm containing a confidential `turntable-web` client, public `turntable-mobile` client, and bearer-only `turntable-api` resource marker.
- Require Authorization Code with PKCE S256 for user clients. Disable implicit, resource-owner-password, and service-account flows by default.
- Add the environment-specific TurnTable API audience only to access tokens. Continue to validate exact issuer, audience, signature, expiration, and subject in the NestJS boundary.
- Keep local realm configuration free of users and passwords. User registration or administrator-created accounts provide test identities.
- Use Keycloak `start-dev` and HTTP only for Compose-based local development. Production requires a separately built optimized image, public HTTPS hostname, reverse proxy, managed secrets, SMTP, backups, monitoring, upgrade testing, and an availability design appropriate to deployment scale.

## Consequences

- TurnTable no longer depends on Auth0 or another per-user SaaS identity subscription for its reference deployment.
- Web and mobile integrations remain portable OIDC clients rather than Keycloak-specific business logic.
- The project owns identity-service patching, database recovery, mail delivery, abuse controls, capacity, and availability.
- Local startup includes two additional containers: Keycloak and its isolated PostgreSQL service.
- Realm startup import is bootstrap configuration, not a production backup or continuous reconciliation mechanism.
