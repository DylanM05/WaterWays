FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
COPY .env .env.build

# Load .env before build - filter out invalid variable names
RUN export $(grep -v '^[0-9]' .env.build | grep -v '^#' | xargs) && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY .env .env.build
COPY --from=builder /app/dist ./dist

EXPOSE 42069

# Load .env and start server
CMD ["sh", "-c", "export $(grep -v '^[0-9]' .env.build | grep -v '^#' | xargs) && npm start"]
