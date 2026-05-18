FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
EXPOSE 5001
ENV NODE_ENV=production
CMD ["npx", "tsx", "server/index.ts"]
