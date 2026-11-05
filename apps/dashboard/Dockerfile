FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# API_URL is the internal Docker service URL used by Next.js server-side rewrites.
# It must be passed at build time because next.config.mjs is evaluated during `next build`.
ARG API_URL=http://api:3001
ENV API_URL=${API_URL}
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
