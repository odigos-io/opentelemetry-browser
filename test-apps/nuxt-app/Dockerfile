# Build the Nuxt app (Nitro server output), then run the SSR server.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci fails on optional peerDependency conflicts in this lockfile (cac/commander).
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 NITRO_PORT=3000
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
