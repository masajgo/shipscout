FROM node:20-alpine

WORKDIR /app

# Only install production deps — skip Next.js, TypeScript, Playwright, etc.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY worker/ ./worker/

ENV NODE_ENV=production

CMD ["node", "worker/aisWorker.js"]
