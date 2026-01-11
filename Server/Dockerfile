FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
COPY .env .env.build

EXPOSE 42069

# Load .env and start server
CMD ["sh", "-c", "export $(grep -v '^[0-9]' .env.build | grep -v '^#' | xargs) && npm start"]
