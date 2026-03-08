# Claw Empire Dockerfile
# Multi-stage build for production deployment

# Build stage
FROM node:22-bookworm-slim AS builder

# Set UTF-8 locale explicitly for Japanese text support
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODE_ENV=production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.30.1

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build application
RUN pnpm run build

# Production stage
FROM node:22-bookworm-slim AS production

# Set UTF-8 locale explicitly for Japanese text support
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.30.1

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

# Copy server files
COPY server ./server

# Create non-root user for security
RUN groupadd -r climpire && \
    useradd -r -g climpire -u 1001 -s /bin/bash -m climpire && \
    chown -R climpire:climpire /app

USER climpire

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["pnpm", "start"]
