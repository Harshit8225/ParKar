# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Production install only - dev dependencies (jest, nodemon) never ship.
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# dumb-init reaps zombies and forwards SIGTERM, so the graceful shutdown in
# src/server.js actually runs when the container is stopped.
RUN apk add --no-cache dumb-init curl

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Run unprivileged. The node image already ships a `node` user.
RUN chown -R node:node /app
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
