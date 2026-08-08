# Keycloak integration: delta from the original plan

## Original plan

- Keep authentication behind an OIDC adapter.
- Use a managed identity provider in production.
- Use the isolated HS256 development-token verifier for local work.
- Use Authorization Code with PKCE in future web/mobile clients.
- Let TurnTable own household authorization while the provider owns login.

## Revised plan

- Keycloak is the self-hosted reference provider for local, staging, and production deployments.
- Local development now exercises the same remote-discovery/JWKS verifier used outside development instead of defaulting to synthetic tokens.
- Compose provisions Keycloak 26.7.0 and a separate PostgreSQL 18 database.
- A deterministic local realm defines the web, mobile, and API boundaries, PKCE requirements, redirect URIs, standard profile claims, and API audience.
- A project command performs an interactive, real Authorization Code plus PKCE flow and verifies `GET /v1/me` without exposing the bearer token.
- The HS256 development verifier remains available only as an explicit local/test fallback for offline and isolated automated tests.

## Intentionally unchanged

- The NestJS API still validates standard issuer, audience, JWKS signature, expiration, and subject claims without importing a Keycloak SDK.
- The external OIDC subject remains the only provider identity stored by TurnTable.
- Household membership and OWNER/MEMBER authorization remain authoritative in PostgreSQL and independent of provider roles.
- Web/mobile clients still use Authorization Code with PKCE; no custom password flow was added to TurnTable.
- The handoff specification package remains read-only.

## New responsibilities

Avoiding per-user SaaS pricing moves operational responsibility into the project: identity database backups, SMTP, security upgrades, availability, monitoring, abuse response, capacity planning, and recovery testing are now deployment requirements.

## External cutover

Tracked configuration and documentation no longer require an Auth0 tenant, application, API, client ID, or client secret. Existing Auth0 resources are outside this repository; disable or delete them in Auth0 only after the staging Keycloak issuer, redirects, user migration strategy, and rollback window have been verified. Revoke any former Auth0 secrets during that cleanup.
