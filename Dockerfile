# syntax=docker/dockerfile:1

# ---- Stage 1: install production dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: runtime image (minimal, non-root) ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user; keep the FS read-only.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app && chown -R appuser:appgroup /app

COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup src ./src
COPY --chown=appuser:appgroup package.json package-lock.json ./

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
