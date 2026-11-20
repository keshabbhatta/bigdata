# Build from the repository root:  docker build -f backend/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY shared ./shared
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]
