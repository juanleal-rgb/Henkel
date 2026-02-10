# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN bunx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package.json for start script
COPY --from=builder /app/package.json ./

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

# Copy node_modules for production runtime
COPY --from=builder /app/node_modules ./node_modules

# Copy next.config for runtime
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start Next.js server
CMD ["bun", "run", "start"]
