# =============================================================================
# GEO Platform — Frontend Dockerfile (T04: Full Next.js Implementation)
# =============================================================================
# Multi-stage build: builder (install deps + next build) → runner (prod image)
# Based on node:20-alpine for minimal image size.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install all dependencies and build Next.js
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install ALL dependencies (including devDependencies for next build)
RUN npm install --ignore-scripts

# Copy source code
COPY frontend/next.config.ts frontend/tsconfig.json frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/components.json ./
COPY frontend/src ./src
COPY frontend/public ./public 2>/dev/null || true

# Build Next.js (generates .next/standalone and .next/static)
RUN npx next build

# ---------------------------------------------------------------------------
# Stage 2: Runner — production image with only runtime dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

LABEL maintainer="GEO Platform Team"
LABEL description="GEO Platform Frontend — Next.js 15 + React 19"
LABEL phase="phase-2"

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy the standalone build from the builder stage
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy public assets
COPY frontend/public ./public 2>/dev/null || true

# Copy .env.example as fallback
COPY frontend/.env.example ./.env.example

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs

# Expose the Next.js server port
EXPOSE 3000

# Healthcheck: verify the server responds
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -f http://localhost:3000 || exit 1

ENV NEXT_TELEMETRY_DISABLED=1

# Start the Next.js production server
CMD ["node", "server.js"]
