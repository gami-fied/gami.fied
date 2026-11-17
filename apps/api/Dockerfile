FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
# Installs only this app's packages and the root tools (turbo), so the website and the other
# apps' dependencies are not installed, once per platform, under emulation.
RUN pnpm install --frozen-lockfile --filter "@gami/api..." --filter "{.}"
RUN pnpm exec turbo build --filter=@gami/api...
# Reinstalls from the lockfile with production packages only, so the image runs the exact
# versions CI tested. `pnpm deploy` is avoided because it can resolve newer versions.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/src packages/*/src && \
    pnpm install --frozen-lockfile --prod --filter "@gami/api..."
# better-auth's optional peers (drizzle-kit, vitest) bring esbuild's native binary along. Nothing
# runs it in production (migrations use drizzle-orm), so it is left out of the image.
RUN rm -rf node_modules/.pnpm/esbuild@* node_modules/.pnpm/@esbuild+*

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Set by the release workflow, so the image reports the tag it was built from.
ARG GAMI_VERSION
ENV GAMI_VERSION=${GAMI_VERSION}

# The app runs with node alone. npm and corepack come with the base image but are never used,
# and they carry their own dependencies for image scanners to flag, so they are removed.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Compose mounts a volume here, and a new named volume takes this ownership.
RUN mkdir -p /app/storage/backups && chown -R nodejs:nodejs /app/storage

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/docs/openapi.json ./docs/openapi.json

USER nodejs
EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
