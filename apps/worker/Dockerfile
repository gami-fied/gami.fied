FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@gami/worker...
# Reinstalls from the lockfile with production packages only, so the image runs the exact
# versions CI tested. `pnpm deploy` is avoided because it can resolve newer versions.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/src packages/*/src && \
    pnpm install --frozen-lockfile --prod --filter "@gami/worker..."

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker ./apps/worker

USER nodejs

CMD ["node", "apps/worker/dist/index.js"]
