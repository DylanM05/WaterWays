FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
COPY .env .env.build

# Load .env before build - filter out invalid variable names
RUN export $(grep -v '^[0-9]' .env.build | grep -v '^#' | xargs) && npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install serve to serve static files (an exact version; check -s and -l still work before changing it)
RUN npm install -g serve@14.2.8

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Run as the image's unprivileged user, not root
USER node

EXPOSE 5173

# Serve production build
CMD ["serve", "-s", "dist", "-l", "5173"]
