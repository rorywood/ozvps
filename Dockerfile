# OzVPS Panel - Multi-stage Docker build
# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install all dependencies (drizzle-kit and tsx are in devDependencies but needed for migrations)
COPY package*.json ./
RUN npm ci

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy files needed for migrations
COPY --from=builder /app/drizzle.config.cjs ./drizzle.config.cjs
COPY --from=builder /app/shared ./shared

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S ozvps && \
    adduser -S ozvps -u 1001 -G ozvps

# Set ownership
RUN chown -R ozvps:ozvps /app

# Switch to non-root user
USER ozvps

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the application with migrations
ENV NODE_ENV=production
ENTRYPOINT ["./docker-entrypoint.sh"]
