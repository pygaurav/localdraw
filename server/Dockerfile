FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Data directory for persisted scenes
RUN mkdir -p /app/data/scenes

EXPOSE 6002

ENV PORT=6002

CMD ["node", "server.js"]
