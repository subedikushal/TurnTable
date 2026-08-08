# Local development runbook

1. Copy `.env.example` to `.env` and replace the local-only secret placeholders.
2. Start TurnTable PostgreSQL, Redis, Keycloak PostgreSQL, and Keycloak with `docker compose up -d --wait`.
3. Run `pnpm auth:oidc:check` to verify the imported realm's exact issuer and JWKS signing keys.
4. Apply schema history with `pnpm db:migrate`.
5. Start the API and worker with `pnpm dev`; it loads the root `.env` and builds required workspace packages. Alternatively, run them separately with filtered commands from the root README.
6. Verify `/health/live`, `/health/ready`, and `/health/build`.
7. Run `pnpm auth:oidc:verify`, open its printed login URL, and register or log in to prove the real PKCE token flow through `/v1/me`.
8. For worker queue verification, run `pnpm --filter @turntable/worker probe` while the worker is running.

Do not use production data or credentials in local/preview environments. Local Keycloak runs in development mode; follow `docs/runbooks/keycloak.md` for production requirements. Redis loss must remain recoverable from PostgreSQL outbox state once dispatch is implemented.
