FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
EXPOSE 5001
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=400"
CMD ["npx", "tsx", "server/index.ts"]
