# syntax=docker/dockerfile:1

# Production image for the Play Store storefront (Next.js + bun).
# Build:  docker build -t playstore-storefront .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=... playstore-storefront

# ---- Base: bun runtime ----
FROM oven/bun:1 AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
# Force rebuild: change this value to bust Docker cache
ENV CACHE_BUST=20260814
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- Run ----
FROM base AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
