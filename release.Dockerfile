# Builds the Odigos browser OpenTelemetry agent bundle and packages it into a minimal
# image that exposes /instrumentations/browser/agent.js, matching the layout the Odigos
# odiglet expects from agent images (see odiglet/Dockerfile COPY --from=...agents/<lang>).
#
# The bundle is pure JavaScript and architecture independent, so no per-arch build is needed.

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

# Install dependencies first to leverage layer caching.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build the single-file IIFE bundle into dist/agent.js (+ source map).
COPY tsconfig.json build.mjs ./
COPY src ./src
RUN npm run build

######### release image #########
FROM scratch
WORKDIR /instrumentations
COPY --from=build /app/dist/agent.js /instrumentations/browser/agent.js
COPY --from=build /app/dist/agent.js.map /instrumentations/browser/agent.js.map
