FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@gami/api...
# Copies only this app and its production dependencies, with no pnpm needed at runtime.
RUN pnpm --filter @gami/api deploy --prod --legacy /prod

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Compose mounts a volume here, and a new named volume takes this ownership.
RUN mkdir -p /app/storage/backups && chown -R nodejs:nodejs /app/storage

COPY --from=builder /prod /app
COPY --from=builder /app/docs/openapi.json /app/docs/openapi.json

USER nodejs
EXPOSE 3001

CMD ["node", "dist/index.js"]
