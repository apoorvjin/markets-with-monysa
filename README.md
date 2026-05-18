# Markets API + Moby

Global financial markets intelligence platform. Express backend serving a Flutter mobile app (Moby).

> **Disclaimer:** All prices, signals, and data shown are for informational purposes only and do not constitute financial advice.

---

## What It Does

Answers three questions for macro investors and traders:

- **Tariff exposure** — US tariff impact across 113+ countries with sector breakdown
- **Live markets** — 46 global indices, 23 commodities, 44 forex pairs
- **AI trading signals** — BUY/HOLD/SELL with entry, SL, TP for 49+ assets

---

## Repo Structure

```
markets-with-monysa/
├── server/                 # Express API backend (TypeScript)
│   ├── index.ts            # Entry point — CORS, body parsing, health route
│   ├── routes.ts           # All API handlers (stocks, futures, volatility, debt)
│   ├── trading.ts          # /api/trading routes (quotes, signals, backtest, news)
│   └── storage.ts          # In-memory cache + quote store
├── moby/                   # Flutter frontend (iOS/Android)
├── build_release.sh        # Build + install Moby on connected iPhone
├── start.sh                # Local dev launcher (starts server in new Terminal window)
├── Dockerfile              # Docker image for server (deployed to Fly.io)
└── fly.toml                # Fly.io deployment config
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- Flutter SDK (for Moby)

### 1. Start the backend

```bash
npm install
npm run server:dev          # starts on http://localhost:5001
```

Or use the launcher script (opens a dedicated Terminal window on macOS):

```bash
./start.sh
```

### 2. Run the Flutter app

```bash
cd moby
flutter run                 # iOS Simulator, Android, or Chrome
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Optional — enables sub-second crypto prices via Finnhub WebSocket
FINNHUB_API_KEY=

# Optional — enables AI market briefings (GPT-4o-mini)
OPENAI_API_KEY=

# Optional — comma-separated allowed CORS origins for production
ALLOWED_ORIGINS=https://your-domain.com
```

The server works without any keys — those features fall back gracefully.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run server:dev` | Start backend in watch mode (tsx) on port 5001 |
| `npm run server:build` | Bundle server with esbuild to `server_dist/` |
| `npm run server:prod` | Run the bundled production server |

---

## API Endpoints

Backend runs on **port 5001**. All endpoints return JSON.

| Method | Endpoint | Description | Cache |
|--------|----------|-------------|-------|
| GET | `/` | Health check | — |
| GET | `/api/stocks/:countryCode` | Live country stocks | 4h |
| GET | `/api/futures/indices` | 46 global indices | 10m |
| GET | `/api/futures/commodities` | 23 commodities in USD | 10m |
| GET | `/api/futures/forex` | 44 forex pairs | 10m |
| GET | `/api/futures/cot-metals` | CFTC COT hedge fund positions | varies |
| GET | `/api/chart/:symbol` | OHLCV candlestick data | varies |
| GET | `/api/trading/quotes` | Live prices for 49 assets | 30s |
| GET | `/api/trading/signals/:symbol` | AI BUY/HOLD/SELL + confidence | 30s |
| GET | `/api/trading/history/:symbol` | OHLCV candles | varies |
| GET | `/api/trading/backtest/:symbol` | Walk-forward backtest S1/S2/S3 | varies |
| GET | `/api/trading/news/:symbol` | Headlines + sentiment | varies |
| GET | `/api/volatility/assets` | Crisis assets + sparklines | 10m |
| POST | `/api/volatility/briefing` | GPT-4o-mini stress analysis | 30m |
| GET | `/api/usa-debt` | Live US debt from Treasury API | 12h |
| GET | `/api/bonds` | US Treasury yield curve | 10m |
| GET | `/api/sectors` | 11 sector ETF performance | 10m |
| GET | `/api/search?q=QUERY` | Yahoo Finance stock search | none |
| GET | `/api/country-data/:code` | World Bank GDP/trade/military data | 24h |

---

## Deployment

The server is deployed to Fly.io:

```bash
fly deploy
```

The Moby app points to `https://monysa-api.fly.dev` in production (configured in `moby/lib/core/network/api_endpoints.dart`).

---

## External Data Sources

| Data | Source |
|------|--------|
| Stock prices / charts | Yahoo Finance Chart API v8 |
| Indices, Commodities, Forex | Yahoo Finance |
| US National Debt | US Treasury Fiscal Data API |
| COT Metals report | CFTC Socrata API |
| GDP / Trade data | World Bank API |
| Tariff rates | Hardcoded from USTR / Commerce Dept (April 2025) |
