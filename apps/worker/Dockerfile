# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json eslint.config.mjs .prettierrc.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps/worker apps/worker
COPY packages/observability packages/observability
COPY packages/tsconfig packages/tsconfig
RUN pnpm --filter @turntable/worker... build
RUN pnpm --filter @turntable/worker deploy --prod /prod/worker

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN groupadd --system turntable && useradd --system --gid turntable --home-dir /workspace turntable
COPY --from=build --chown=turntable:turntable /prod/worker /workspace
USER turntable
CMD ["node", "dist/main.js"]
