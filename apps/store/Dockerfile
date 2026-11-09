# syntax=docker/dockerfile:1
# Store app: one image serves every shop (TENANCY_MODE=multi, see docs/DEPLOY.md 2b).
#   docker build -f apps/store/Dockerfile -t axiom-store .
# Dokploy: build path ".", Dockerfile path "apps/store/Dockerfile", port 3000, domain *.axiom.appbrainer.tech.
FROM oven/bun:1 AS deps
WORKDIR /repo/apps/store
COPY apps/store/package.json apps/store/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /repo/apps/store
COPY --from=deps /repo/apps/store/node_modules ./node_modules
COPY apps/store ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1 AS run
WORKDIR /repo/apps/store
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/store ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "server.ts"]
