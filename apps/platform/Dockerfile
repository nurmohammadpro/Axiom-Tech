# syntax=docker/dockerfile:1
# Platform admin. Build context = REPO ROOT (it needs apps/store/src/db/migrations):
#   docker build -f apps/platform/Dockerfile -t axiom-platform .
# Dokploy: build path ".", Dockerfile path "apps/platform/Dockerfile", port 3100.
FROM oven/bun:1 AS deps
WORKDIR /repo/apps/platform
COPY apps/platform/package.json apps/platform/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /repo/apps/platform
COPY --from=deps /repo/apps/platform/node_modules ./node_modules
COPY apps/platform ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1 AS run
WORKDIR /repo/apps/platform
ENV NODE_ENV=production PORT=3100 HOST=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ENV STORE_MIGRATIONS_DIR=/repo/apps/store/src/db/migrations
COPY --from=build /repo/apps/platform ./
COPY apps/store/src/db/migrations /repo/apps/store/src/db/migrations
EXPOSE 3100
# Migrations/seed (one-off): docker exec <c> bun run db:migrate
CMD ["bun", "run", "start"]
