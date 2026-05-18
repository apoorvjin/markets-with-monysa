# Moby — Global Financial Intelligence

Flutter mobile app (iOS / Android) backed by a TypeScript Express API. Built for macro investors, professional traders, and trade compliance teams.

> **Disclaimer:** All prices, signals, and data shown are for informational purposes only and do not constitute financial advice.

---

## What It Does

Three core capabilities:

- **Tariff Exposure** — US tariff impact ranked across 113+ countries with per-sector breakdown and USTR source links
- **Live Markets** — 46 global indices, 23 commodities, 44 forex pairs with interactive candlestick charts
- **AI Trading Signals** — BUY / HOLD / SELL with entry price, stop loss, take profit, and reasoning for 49+ assets across three configurable strategies (S1 / S2 / S3)

---

## Repo Structure

```
markets-with-monysa/
├── server/
│   ├── index.ts          # Express entry — CORS, body parsing, request logging
│   ├── routes.ts         # All API handlers (stocks, futures, charts, volatility, debt)
│   ├── trading.ts        # /api/trading routes (quotes, signals, backtest, news)
│   └── storage.ts        # In-memory cache + live quote store
├── moby/                 # Flutter frontend (iOS / Android / Web)
│   ├── lib/
│   │   ├── main.dart
│   │   ├── app.dart      # MaterialApp.router + bottom nav (5 tabs)
│   │   ├── core/         # Network client, router, theme system
│   │   ├── data/         # Models, repositories, hardcoded tariff data
│   │   ├── features/     # One folder per screen
│   │   ├── providers/    # Riverpod providers (strategy, theme, alerts)
│   │   ├── shared/       # Reusable widgets (GlassCard, ChartModal, etc.)
│   │   └── utils/        # TradingView symbol mapper
│   └── pubspec.yaml
├── build_release.sh      # One-command release build + install on iPhone
├── start.sh              # macOS launcher — opens backend in a new Terminal window
├── Dockerfile            # Server image for Fly.io
└── fly.toml              # Fly.io deployment config
```

---

## Tech Stack

### Backend
| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Language | TypeScript 5.9 (bundled with esbuild) |
| Dev server | `tsx watch` (hot-reload) |
| AI briefings | OpenAI SDK — GPT-4o-mini |
| Crypto prices | Finnhub WebSocket |
| Validation | Zod |

### Flutter (Moby)
| Layer | Choice |
|-------|--------|
| SDK | Flutter ≥ 3.3, Dart ≥ 3.3 |
| Navigation | go_router ^14 |
| State management | flutter_riverpod ^2.5 |
| HTTP | dio ^5.4 |
| Persistence | shared_preferences ^2.3 |
| Fonts | google_fonts ^6.2 (Inter) |
| Sparklines | fl_chart ^0.68 |
| Candlestick charts | webview_flutter ^4.8 (Lightweight Charts v4) |
| Number formatting | intl ^0.19 |
| Loading skeletons | shimmer ^3.0 |
| External links | url_launcher ^6.3 |

---

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Splash | `/splash` | Animated intro; restores last-visited tab |
| Markets | `/markets` | Indices / Commodities / Forex sub-tabs; inline search; CFTC COT metals |
| Trading | `/trading` | Dashboard (49 assets + watchlist) / AI Signals / Price Alerts |
| Exposure | `/exposure` | 113+ countries ranked by US tariff rate |
| Volatility | `/volatility` | Market Stress Meter, VIX, crisis playbook, yield curve, AI briefing, economic calendar |
| US Debt | `/debt` | Live Treasury data — big picture, personal, foreign holders, spending |
| Country Detail | `/country/:code` | Tariff rate, sector breakdown, financial exposure |
| Country Stocks | `/country/:code/stocks` | Sortable live stocks for a country (India: NSE/BSE tabs) |
| Asset Detail | `/asset/:symbol` | Chart / Signal / Indicators / Backtest / News — any Yahoo Finance ticker |

All screens support **dark and light themes** via a persistent toggle in each AppBar.

---

## API Endpoints

Backend runs on **port 5001**. All endpoints return JSON.

| Method | Endpoint | Description | Cache TTL |
|--------|----------|-------------|-----------|
| GET | `/` | Health check | — |
| GET | `/api/stocks/:countryCode` | Live country stocks | 4 h |
| GET | `/api/futures/indices` | 46 global indices | 10 m |
| GET | `/api/futures/commodities` | 23 commodities in USD | 10 m |
| GET | `/api/futures/forex` | 44 forex pairs | 10 m |
| GET | `/api/futures/cot-metals` | CFTC COT hedge fund positions (metals) | varies |
| GET | `/api/chart/:symbol` | OHLCV candlestick data (1mo/3mo/6mo/1y/5y) | varies |
| GET | `/api/trading/quotes` | Live prices for 49 assets | 30 s |
| GET | `/api/trading/signals/:symbol` | AI BUY/HOLD/SELL + confidence | 30 s |
| GET | `/api/trading/history/:symbol` | OHLCV candles (timeframe param) | varies |
| GET | `/api/trading/backtest/:symbol` | Walk-forward backtest S1/S2/S3 | varies |
| GET | `/api/trading/news/:symbol` | Headlines + per-article sentiment | varies |
| GET | `/api/volatility/assets` | Crisis assets + sparklines | 10 m |
| POST | `/api/volatility/briefing` | GPT-4o-mini macro stress analysis | 30 m |
| GET | `/api/usa-debt` | Live US debt from Treasury API | 12 h |
| GET | `/api/bonds` | US Treasury yield curve (3 m/5 y/10 y/30 y + spread) | 10 m |
| GET | `/api/sectors` | 11 sector ETF performance (1W/1M change %) | 10 m |
| GET | `/api/search?q=QUERY` | Yahoo Finance symbol/name search | none |
| GET | `/api/country-data/:code` | World Bank GDP, trade, military data | 24 h |

---

## Running Locally

### Prerequisites

- **Node.js 20+**
- **Flutter SDK** (stable channel)

### 1. Start the backend

```bash
npm install
npm run server:dev          # http://localhost:5001
```

Or open a dedicated Terminal window on macOS:

```bash
./start.sh
```

> macOS AirPlay occupies port 5000. The server always uses **port 5001** — do not change this.

### 2. Run the Flutter app pointing at the local backend

```bash
cd moby
flutter run --dart-define=API_BASE_URL=http://localhost:5001
```

Without `--dart-define`, the app defaults to the production Fly.io server (`https://monysa-api.fly.dev`).

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Optional — enables sub-second crypto prices via Finnhub WebSocket
FINNHUB_API_KEY=

# Optional — enables AI market briefings (GPT-4o-mini)
OPENAI_API_KEY=
```

The server works without any keys — those features degrade gracefully.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run server:dev` | Start backend in watch mode (`tsx watch`) on port 5001 |
| `npm run server:build` | Bundle server with esbuild → `server_dist/` |
| `npm run server:prod` | Run the bundled production server |

---

## Building for Release (iPhone)

Connect your iPhone via USB, then run:

```bash
./build_release.sh
```

The script:
1. Detects the connected iPhone via `flutter devices`
2. Runs `flutter clean`
3. Reinstalls CocoaPods (`pod deintegrate && pod install`)
4. Builds and installs a release build pointing at `https://monysa-api.fly.dev`

> The device must be trusted (tap "Trust" on the iPhone prompt) and unlocked.

---

## Debugging

### Backend

```bash
npm run server:dev
```

`tsx watch` auto-restarts on any change to `server/*.ts`. There is a ~1 s gap during restart where in-flight requests return errors — this is expected in dev.

Verify endpoints manually:

```bash
curl http://localhost:5001/
curl http://localhost:5001/api/futures/indices | jq '.items | length'
curl http://localhost:5001/api/trading/quotes | jq 'keys'
```

### Flutter

```bash
cd moby
flutter run --dart-define=API_BASE_URL=http://localhost:5001
```

- Use `flutter analyze --no-fatal-infos` — zero errors expected.
- Use Flutter DevTools (`flutter pub global run devtools`) for widget inspection, network, and performance profiling.
- Riverpod state is inspectable via the Riverpod DevTools extension.
- WebView (chart) issues: check the Dart-side JSON embedding — `fetch()` inside the WebView HTML is blocked by CORS because `loadHtmlString` yields a null origin. Always fetch candle data in Dart and embed as inline JSON.

### Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| App shows prod data instead of local | Missing `--dart-define` | Add `--dart-define=API_BASE_URL=http://localhost:5001` |
| Server not reloading on save | `tsx watch` silent failure | Kill and restart `npm run server:dev` |
| Charts blank in WebView | `fetch()` call inside HTML | Fetch in Dart, embed as `const raw = $json;` |
| Backtest fields missing | Wrong field names | Use `sharpe` and `trades`, not `sharpeRatio`/`totalTrades` |
| Signal API 404 | Using strategy label | Use `serverParam` ("1"/"2"/"3"), not label ("S1"/"S2"/"S3") |

---

## Deployment

The backend is deployed to Fly.io:

```bash
fly deploy
```

Production URL: `https://monysa-api.fly.dev`

The Flutter app points to this URL by default (no `--dart-define` needed for production builds).

---

## External Data Sources

| Data | Source |
|------|--------|
| Stock prices, charts, search | Yahoo Finance Chart API v8 |
| Indices, Commodities, Forex | Yahoo Finance |
| US National Debt | US Treasury Fiscal Data API |
| CFTC COT Metals report | CFTC Socrata API |
| GDP / Trade / Military data | World Bank API |
| Tariff rates | Hardcoded from USTR / Commerce Dept (April 2025) |
| AI macro briefings | OpenAI GPT-4o-mini |
| Sub-second crypto prices | Finnhub WebSocket |
