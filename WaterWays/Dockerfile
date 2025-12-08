FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments
ARG VITE_PUBLIC_CLERK_PUBLISHABLE_KEY

# Set as environment variables for the build
ENV VITE_PUBLIC_CLERK_PUBLISHABLE_KEY=${VITE_PUBLIC_CLERK_PUBLISHABLE_KEY}

COPY package*.json ./
RUN npm install

COPY . .

# Build for production (Vite will embed the env vars)
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install serve to serve static files
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

EXPOSE 5173

# Serve production build
CMD ["serve", "-s", "dist", "-l", "5173"]
