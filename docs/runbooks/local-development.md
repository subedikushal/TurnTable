# Local development runbook

1. Copy `.env.example` to `.env`. It defaults to strictly local development authentication; production and staging must use OIDC.
2. Start PostgreSQL and Redis with `docker compose up -d`.
3. Wait for `docker compose ps` to show both services healthy.
4. Apply schema history with `pnpm db:migrate`.
5. Start the API and worker with `pnpm dev`; it loads the root `.env` and builds required workspace packages. Alternatively, run them separately with filtered commands from the root README.
6. Verify `/health/live`, `/health/ready`, and `/health/build`.
7. For worker queue verification, run `pnpm --filter @turntable/worker probe` while the worker is running.

Do not use production data or credentials in local/preview environments. Redis loss must remain recoverable from PostgreSQL outbox state once dispatch is implemented.
