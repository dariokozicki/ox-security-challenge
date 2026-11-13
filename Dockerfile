FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node fixtures ./fixtures
COPY --chown=node:node scripts/worker-health.mjs ./scripts/worker-health.mjs
RUN mkdir -p /var/lib/trace/snapshots && chown node:node /var/lib/trace/snapshots
USER node
EXPOSE 4310
CMD ["node", "dist/server/server/main.js"]
