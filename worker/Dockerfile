FROM node:20-alpine

WORKDIR /app

# Sadece prod bağımlılıkları — Next.js, TypeScript, Playwright yok
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Worker + scraper (aisWorker.js → ../scraper/builtYearEnrichment)
COPY worker/   ./worker/
COPY scraper/  ./scraper/

ENV NODE_ENV=production

CMD ["node", "worker/aisWorker.js"]
