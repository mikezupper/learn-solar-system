# syntax=docker/dockerfile:1
#
# The production image: the page and the planet data, served by nginx. There is no Node at runtime.
# Build it with deploy/build-image.sh, which checks every cache rule against a running container
# before anything is pushed.

# Where the planet data comes from. "jpl" builds it from JPL's kernel and checks every year against
# Horizons. "fixtures" copies the two years kept in the repository, for CI, which must never call JPL.
ARG TILE_SOURCE=jpl

# Everything up to the finished files runs once, on the build machine's own platform: the files are
# the same for every platform the image targets.
FROM --platform=$BUILDPLATFORM node:24.15.0-bookworm-slim AS deps
RUN npm install --global pnpm@10.33.2
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/classroom/package.json packages/classroom/
COPY packages/ephemeris/package.json packages/ephemeris/
COPY packages/providers/package.json packages/providers/
COPY tools/harness/package.json tools/harness/
RUN --mount=type=cache,id=learn-solar-system-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store

# Only the code that makes the data, so that a change to the page does not rebuild it.
FROM deps AS tiles-jpl
COPY data data
COPY packages/ephemeris packages/ephemeris
COPY packages/providers packages/providers
COPY apps/worker apps/worker
ARG TILE_YEARS=2000-2050
# The kernel and the published years stay in BuildKit's cache between builds on this machine, so a
# rebuild downloads nothing and asks Horizons only about years it has not published. One build at a
# time writes the store, as the worker expects.
RUN --mount=type=cache,id=learn-solar-system-kernels,target=/cache/kernels \
    --mount=type=cache,id=learn-solar-system-tiles,target=/cache/tiles,sharing=locked \
    KERNEL_CACHE_DIR=/cache/kernels TILE_STORE_DIR=/cache/tiles TILE_YEARS="$TILE_YEARS" pnpm -s tiles:build \
 && mkdir -p /out/tiles \
 && cp /cache/tiles/catalog.json /cache/tiles/*.bin /out/tiles/

FROM scratch AS tiles-fixtures
COPY fixtures/tiles/catalog.json fixtures/tiles/*.bin /out/tiles/

FROM tiles-${TILE_SOURCE} AS tiles

FROM deps AS web
COPY . .
RUN pnpm build

# The page, with the data beside it at /tiles, and a gzip copy of every file that compresses well.
# nginx sends the copy to clients that accept it, so nothing is compressed per request.
FROM web AS site
RUN mkdir -p /site && cp -a apps/web/dist/. /site/
COPY --from=tiles /out/tiles /site/tiles
RUN find /site -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.txt' \) \
      -exec gzip -9 --keep --no-name {} +

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=site /site /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --output-document=/dev/null http://127.0.0.1:8080/healthz || exit 1

# Last, so that a new commit changes only this layer's metadata.
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="Solar System Classroom" \
      org.opencontainers.image.description="Where the planets really are, calculated from NASA JPL's data" \
      org.opencontainers.image.source="https://github.com/mikezupper/learn-solar-system" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.created="$CREATED"
