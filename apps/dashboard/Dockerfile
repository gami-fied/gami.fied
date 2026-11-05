FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Published images run on any domain, so no address is built in. The browser talks to this
# server, and this server reaches the API through API_URL, which is read at runtime.
ENV NEXT_OUTPUT=standalone
RUN pnpm exec turbo build --filter=@gami/dashboard...

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_URL=http://api:3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
