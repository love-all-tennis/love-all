# API image. Build from the repo root: docker build -t love-all-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter love-all --filter "@love-all/api..."
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/api apps/api
# The build bundles every dependency into dist/, so the runtime image needs no node_modules.
RUN pnpm --filter @love-all/api build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "node dist/migrate.mjs && node dist/main.mjs"]
