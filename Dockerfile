# syntax=docker/dockerfile:1
# Same pinned Node 24 base as julie-ng/ai-native-sdlc-agent-images.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Skip postinstall (`nuxt prepare`): the sources are not copied yet and `nuxt build` prepares anyway.
RUN npm ci --no-audit --ignore-scripts
COPY . .
RUN npm run build

# The Nitro output bundles its runtime dependencies; node_modules is not needed.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/.output ./.output
# Read at startup by the migrations plugin, relative to WORKDIR.
COPY server/db/migrations ./server/db/migrations
COPY --chmod=755 scripts/entrypoint.sh /usr/local/bin/platform-services-entrypoint
EXPOSE 3000
# The node user (UID 1000) is provided by the base image; files above stay root-owned and read-only to it.
USER node
ENTRYPOINT ["/usr/local/bin/platform-services-entrypoint"]
CMD ["node", ".output/server/index.mjs"]
