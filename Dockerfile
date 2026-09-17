FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional
COPY client/package*.json ./client/
RUN npm --prefix client ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
