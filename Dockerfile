FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# flyctl — server/routes/admin.ts's /api/admin/logs/metrics shells out to
# `fly logs` (using the FLY_API_TOKEN secret already set on this app) to power
# the admin Performance page. Installs as both `flyctl` and `fly` on PATH;
# curl is build-time only for the installer and removed afterward.
RUN apk add --no-cache curl ca-certificates \
  && curl -fsSL https://fly.io/install.sh | FLYCTL_INSTALL=/usr/local sh \
  && apk del curl \
  && fly version

COPY . .
EXPOSE 5001
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=400"
CMD ["npx", "tsx", "server/index.ts"]
