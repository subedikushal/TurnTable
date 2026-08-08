# Keycloak integration verification

Verified locally on 2026-08-08 with Node.js 24.19.0, pnpm 11.16.0, Keycloak 26.7.0, PostgreSQL 18, and Redis 8.

## Runtime evidence

- Compose started TurnTable PostgreSQL, Redis, isolated Keycloak PostgreSQL, and Keycloak; all four services reported healthy.
- The `turntable` realm imported without committed users.
- Discovery returned the exact configured issuer, and JWKS exposed two signing keys.
- The imported confidential `turntable-web` secret matched the ignored local environment value; neither value was printed.
- Web and mobile clients assign Keycloak 26's built-in `basic` default scope so user access tokens include the required `sub` claim.
- The API started with `AUTH_MODE=oidc`; `GET /health/ready` returned `200` with database, migration, and Redis checks up.
- An unauthenticated `GET /v1/me` returned the expected `401` problem details.
- A real user completed `pnpm auth:oidc:verify`. Authorization Code plus PKCE, confidential-client token exchange, JWKS signature verification, exact issuer and audience checks, the required `sub` claim, and authenticated `GET /v1/me` all succeeded; the API returned `200` with a valid user projection.
- A BullMQ probe completed through real Redis.

## Quality evidence

The following passed:

```text
pnpm install --frozen-lockfile --offline
pnpm format:check
pnpm peers check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm openapi:check
pnpm db:migrate
docker compose config --quiet
docker compose up -d --wait
docker build -f apps/api/Dockerfile -t turntable-api:keycloak .
docker build -f apps/worker/Dockerfile -t turntable-worker:keycloak .
```

The Docker-backed run passed 23 API tests and one worker integration test. Both production application images run as `turntable` with `node dist/main.js`.

## Remaining deployment verification

Local `start-dev` is not a production Keycloak topology. Before production cutover, deploy the requirements in `docs/runbooks/keycloak.md`, configure production redirects and audience, repeat the successful `pnpm auth:oidc:verify` check against staging, test recovery and key rotation, and then retire the external Auth0 resources.
