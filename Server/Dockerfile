FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
# npm/Yarn and download caches are build tools, unnecessary in the runtime image.
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /root/.npm /usr/local/lib/node_modules/npm /opt/yarn-* \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY . .

# The logger writes to /app/logs, and the server runs as the unprivileged node user.
RUN mkdir -p logs && chown node:node logs

USER node

EXPOSE 42069

CMD ["node", "server.js"]
