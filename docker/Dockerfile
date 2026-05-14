# --------------------------------
# BUILD FOR LOCAL DEVELOPMENT
# --------------------------------
FROM node:22 AS development

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Set working directory inside container
WORKDIR /app

# Copy only dependency manifests first (better caching)
COPY --chown=node:node pnpm-lock.yaml ./
COPY --chown=node:node package*.json ./

# Pre-fetch all dependencies (dev + prod)
RUN pnpm fetch

# Copy full source code into container
COPY --chown=node:node . .

# Install all dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile --offline

# Switch to non-root user for security
USER node


# --------------------------------
# BUILD FOR PRODUCTION
# --------------------------------
FROM node:22 AS build

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY --chown=node:node pnpm-lock.yaml ./
COPY --chown=node:node package*.json ./

# Reuse node_modules from development stage (faster build)
COPY --chown=node:node --from=development /app/node_modules ./node_modules

# Copy full application source
COPY --chown=node:node . .

# Build the application (TypeScript → dist, etc.)
RUN pnpm build

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile --config.confirmModulesPurge=false --ignore-scripts


# --------------------------------
# PRODUCTION RUNTIME IMAGE
# --------------------------------
FROM node:22-alpine AS production

# Set environment to production mode
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy production dependencies from build stage
COPY --chown=node:node --from=build /app/node_modules ./node_modules

# Copy compiled output
COPY --chown=node:node --from=build /app/dist ./dist

# Copy audio assets from build
COPY --chown=node:node --from=build /app/audio ./audio

# Copy package metadata
COPY --chown=node:node package*.json ./

# Switch to non-root user for runtime safety
USER node

# Start the application
CMD ["node", "dist/main.js"]