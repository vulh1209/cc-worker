# Build stage
FROM node:20-slim AS builder

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy prisma schema and generate
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code (node_modules excluded via .dockerignore)
COPY . .

# Build server.ts
RUN npx tsc -p tsconfig.server.json

# Build Next.js with production URL
ARG APP_URL=https://cc-server-quiet-feather-4833.fly.dev
ENV APP_URL=$APP_URL
RUN npm run build

# Production stage
FROM node:20-slim AS runner

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.server ./.server
COPY --from=builder /app/prisma ./prisma

# Copy public folder if it exists (optional for Next.js)
RUN mkdir -p ./public
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", ".server/server.js"]
