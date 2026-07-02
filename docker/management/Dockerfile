# =============================================================================
# GEO Platform — Management Layer Dockerfile (T03: Full Implementation)
# =============================================================================
# Multi-stage build: builder (install deps + compile TS) → runner (prod image)
# Based on node:20-alpine for minimal image size.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install all dependencies and compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Install dependencies for bcryptjs native compilation (if needed)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY management-layer/package.json management-layer/package-lock.json* ./

# Install ALL dependencies (including devDependencies for tsc)
RUN npm install --ignore-scripts

# Copy Prisma schema and generate client
COPY management-layer/prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma

# Copy source code
COPY management-layer/tsconfig.json ./
COPY management-layer/src ./src

# Compile TypeScript to dist/
RUN npx tsc

# ---------------------------------------------------------------------------
# Stage 2: Runner — production image with only runtime dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

LABEL maintainer="GEO Platform Team"
LABEL description="GEO Platform Management Layer — Node.js + Fastify"
LABEL phase="phase-2"

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY management-layer/package.json management-layer/package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy .env.example as fallback (environment variables come from docker-compose)
COPY management-layer/.env.example ./.env.example

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs

# Expose the Fastify server port
EXPOSE 3001

# Healthcheck: verify the server responds on /health
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the server
# Note: Prisma migrations are run separately via docker-compose init service
CMD ["node", "dist/index.js"]
