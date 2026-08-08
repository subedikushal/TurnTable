# Keycloak development and deployment runbook

TurnTable uses self-hosted Keycloak as its reference OIDC provider. The NestJS API remains provider-neutral and consumes only standard discovery, JWKS, and JWT claims.

## Local startup

Copy `.env.example` to `.env` once, then replace every local secret before sharing the environment with other users. Start the infrastructure:

```bash
docker compose up -d --wait
pnpm auth:oidc:check
pnpm db:migrate
pnpm dev
```

Local endpoints:

```text
Keycloak:     http://localhost:8080
Admin:        http://localhost:8080/admin/
Realm issuer: http://localhost:8080/realms/turntable
API:          http://localhost:3000
```

The local admin username is `KEYCLOAK_ADMIN_USERNAME`; its password and the web client secret stay only in ignored `.env` or a deployment secret manager.

## Realm model

- `turntable-web`: confidential server-rendered client, Authorization Code, PKCE S256, local callback `http://localhost:3001/auth/callback`.
- `turntable-mobile`: public native client, Authorization Code, PKCE S256, callback `turntable://auth/callback`.
- `turntable-api`: bearer-only resource marker; it cannot log in users or obtain service-account tokens.
- Access tokens from the web/mobile clients include `urn:turntable:api:local` as the API audience.
- Direct password grants, implicit flow, and client-credential service accounts are disabled.

The committed realm contains no users. Register through the login UI or create a local user in the admin console.

## End-to-end verification

With Compose and the API running, execute:

```bash
pnpm auth:oidc:verify
```

Open the printed URL, register or log in, and allow the callback to finish. The command exchanges the authorization code with PKCE, verifies the access-token signature/issuer/audience through Keycloak JWKS, calls `GET /v1/me`, prints only non-secret verification results, and never persists the raw token.

## Realm import behavior

`--import-realm` imports the realm only when it does not already exist. Editing the JSON does not overwrite a realm in an existing Keycloak database. For routine changes, use a reviewed administrative migration or controlled import process. Treat the PostgreSQL database and its backups—not the bootstrap JSON—as authoritative Keycloak state after deployment.

## Production requirements

Do not deploy the local `start-dev` command or local credentials. Production requires:

- an optimized, pinned Keycloak image and supported PostgreSQL version;
- an HTTPS hostname such as `https://auth.turntable.example` and exact issuer configuration;
- separate database roles, TLS, encrypted storage/backups, tested recovery, and credential rotation;
- an SMTP provider for verification, password recovery, and security notifications;
- brute-force protections, MFA/passkey policy, event/audit retention, metrics, alerting, and upgrade rehearsals;
- multiple Keycloak replicas and database availability appropriate to the service objective;
- production web/mobile redirect URIs and an environment-specific API audience.

The management port (`9000`) is for internal health/metrics only and must not be exposed through the public reverse proxy.

## Troubleshooting

- Discovery failure: compare `OIDC_ISSUER_URL` exactly with the discovery document's `issuer` value.
- Audience rejection: confirm the client has the TurnTable audience mapper and the API uses the matching `OIDC_AUDIENCE`.
- Missing token subject: confirm `basic` is assigned as a default client scope; Keycloak 26 provides the `sub` mapper through that built-in scope.
- Login callback rejection: verify the exact redirect URI in the realm/client and local environment.
- Existing realm ignores JSON edits: the startup importer skips existing realms by design; use a controlled admin migration.
- Keycloak is unhealthy: inspect `docker compose logs keycloak` and confirm `keycloak-postgres` is healthy.
