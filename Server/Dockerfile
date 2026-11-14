FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The logger writes to /app/logs, and the server runs as the unprivileged node user.
RUN mkdir -p logs && chown node:node logs

USER node

EXPOSE 42069

CMD ["npm", "start"]
