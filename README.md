# Monysa — Global Markets Intelligence App

A React Native / Expo mobile and web application for global financial market intelligence. Covers US tariff rates for 113+ countries with sector breakdowns, live global stock prices, AI-powered trading signals, real-time indices/commodities/forex, a crisis/volatility playbook, and US national debt statistics — all in a dark-themed financial dashboard.

> **Disclaimer:** All prices, signals, and data shown are for informational purposes only and do not constitute financial advice.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Mobile / Web Frontend | Expo + React Native | SDK 54 / RN 0.81 |
| Navigation | expo-router (file-based) | ~6.0 |
| Backend | Express.js + TypeScript | v5 |
| State Management | TanStack React Query | v5 |
| Database ORM | Drizzle ORM + PostgreSQL | ^0.39 |
| Charts | Lightweight Charts (WebView) | v4 (MIT) |
| AI Signals | OpenAI GPT-4o-mini | — |
| Animations | react-native-reanimated | ~4.1 |
| Fonts | Inter via @expo-google-fonts | — |
| Icons | @expo/vector-icons (Ionicons) | — |

---

## Prerequisites

Make sure you have the following installed on your laptop before starting.

### 1. Node.js v18 or later

Download from https://nodejs.org or use a version manager:

```bash
# macOS with Homebrew
brew install node

# Windows — download installer from https://nodejs.org

# Verify
node --version   # should print v18.x or v20.x
npm --version    # should print v9.x or later
```

### 2. Git

```bash
# macOS
brew install git

# Windows — download from https://git-scm.com

# Verify
git --version
```

### 3. Expo Go (on your phone — for live device testing)

- **iPhone**: Search "Expo Go" in the App Store
- **Android**: Search "Expo Go" in Google Play

### 4. (Optional) iOS Simulator — macOS only

Install Xcode from the Mac App Store, then:

```bash
xcode-select --install
sudo xcode-select -s /Applications/Xcode.app
```

### 5. (Optional) Android Emulator

Install Android Studio from https://developer.android.com/studio and set up a virtual device (AVD).

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/apoorvjin/markets-with-monysa.git
cd markets-with-monysa
```

### 2. Install all dependencies

```bash
npm install
```

This installs both frontend and backend dependencies — they share a single `package.json`.

### 3. Set up environment variables

Create a `.env` file in the project root:

```bash
# Generate a secure secret (run this command, copy the output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Then create the .env file
touch .env
```

Open `.env` in any text editor and add:

```env
# Required — any random string of at least 32 characters
SESSION_SECRET=paste_your_generated_secret_here

# Optional — enables sub-second crypto prices via Finnhub WebSocket
# Get a free key at https://finnhub.io
FINNHUB_API_KEY=

# Optional — enables AI market briefings in the Volatility tab
# Get a key at https://platform.openai.com
OPENAI_API_KEY=
```

> The app works without the optional keys — those features fall back gracefully (crypto prices update every 10 seconds via polling; the AI briefing button is hidden when no key is set).

### 4. Set up the database (optional)

Tariff data is hardcoded and does not require a database. To enable the full PostgreSQL setup:

```bash
# Add to your .env file
DATABASE_URL=postgresql://user:password@localhost:5432/monysa

# Push the schema
npm run db:push
```

---

## Running the App in Development

You need **two terminal windows** open at the same time.

### Terminal 1 — Start the backend server

```bash
npm run server:dev
```

The Express server starts on **http://localhost:5001**. You should see:

```
express server serving on port 5001
baseUrl http://localhost:5001
```

Keep this terminal open.

### Terminal 2 — Start the Expo frontend

```bash
npm run expo:dev
```

> **Note for local development (non-Replit):** The `expo:dev` script uses `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000` to point the frontend at the backend. Outside Replit, `$REPLIT_DEV_DOMAIN` is empty, so API calls will fail. Add this line to your `.env` file:
> ```
> EXPO_PUBLIC_DOMAIN=localhost:5001
> ```
> Or run Expo directly: `npx expo start --localhost`

Metro Bundler starts on **http://localhost:8081**. You will see a QR code and options:

```
› Web is waiting on http://localhost:8081
› Press w  — open in web browser
› Press i  — open in iOS Simulator (macOS + Xcode required)
› Press a  — open in Android Emulator (Android Studio required)
› Scan QR  — open in Expo Go on your phone
```

### Viewing in your browser

Open: **http://localhost:8081**

### Viewing on your phone

1. Make sure your phone and laptop are on the same Wi-Fi network
2. Open the **Expo Go** app on your phone
3. Scan the QR code shown in Terminal 2

---

## Project Structure

```
markets-with-monysa/
├── app/                          # All screens (expo-router file-based routing)
│   ├── _layout.tsx               # Root layout + providers (React Query, fonts, context)
│   ├── index.tsx                 # Animated intro splash (3.2s, random tab on exit)
│   └── (tabs)/                   # 5-tab navigation
│       ├── _layout.tsx           # Tab bar configuration
│       ├── futures.tsx           # Markets tab (indices / commodities / forex)
│       ├── trading.tsx           # AI Trading tab (49 assets, signals, alerts)
│       ├── index.tsx             # Exposure tab (tariff country rankings)
│       ├── volatility.tsx        # Crisis Playbook / Volatility tab
│       └── usa-debt.tsx          # US National Debt tab
├── app/country/
│   ├── [code].tsx                # Country detail (sectors, debt, explanation)
│   └── stocks.tsx                # Top listed stocks for a country
├── app/asset/
│   └── [symbol].tsx              # Asset detail (chart / signal / indicators / backtest / news)
├── server/                       # Express backend (TypeScript)
│   ├── index.ts                  # Server entry — Express setup, CORS, route mounting
│   ├── routes.ts                 # All API route handlers (stocks, futures, volatility, debt)
│   ├── trading.ts                # /api/trading routes (quotes/signals/history/backtest/news)
│   ├── storage.ts                # In-memory cache + quote store
│   └── templates/
│       └── landing-page.html     # Static landing page served on port 5000
├── data/
│   ├── tariffs.ts                # Hardcoded tariff data — 113 countries, 5 sectors each
│   └── usa-debt.ts               # US national debt statistics with plain-English labels
├── components/
│   ├── ChartModal.tsx            # Candlestick chart modal (Lightweight Charts v4)
│   ├── AlertBanner.tsx           # In-app price alert banner
│   ├── ExploreMap.tsx            # World map component (web)
│   ├── ExploreMap.native.tsx     # World map component (iOS/Android)
│   └── ErrorBoundary.tsx         # App-level error boundary
├── constants/
│   └── colors.ts                 # Single dark theme colour tokens (teal accent)
├── context/
│   ├── StrategyContext.tsx        # AI trading strategy selection (S1/S2/S3)
│   └── AlertContext.tsx           # Price alert management
├── hooks/
│   └── useColors.ts              # Returns active theme palette
├── lib/
│   └── query-client.ts           # React Query client + API base URL helper
├── shared/
│   ├── schema.ts                 # Drizzle ORM PostgreSQL schema (users table)
│   └── models/
│       └── chat.ts               # Shared chat message type definitions
├── utils/
│   ├── tradingFormat.ts          # Number/price formatting helpers
│   └── accessibility.ts          # a11y annotation helpers
├── scripts/
│   └── build.js                  # Production build script
├── app.json                      # Expo app configuration
├── package.json                  # All dependencies + scripts
└── tsconfig.json                 # TypeScript configuration
```

---

## Available Scripts

| Script | What it does |
|---|---|
| `npm run server:dev` | Start Express backend on port 5000 (TypeScript via tsx) |
| `npm run expo:dev` | Start Expo Metro bundler on port 8081 (Replit-aware) |
| `npm run expo:static:build` | Export Expo web build to `dist/` |
| `npm run server:build` | Bundle Express server with esbuild to `server_dist/` |
| `npm run server:prod` | Run the bundled production server |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |
| `npm run lint` | Run Expo ESLint checks |

---

## Key API Endpoints

The backend runs on **port 5000**. All endpoints return JSON.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stocks/:countryCode` | Live stocks for a country (cached 4h) |
| GET | `/api/futures/indices` | 46 global indices with live prices |
| GET | `/api/futures/commodities` | 23 commodities (Gold, Oil, Silver…) |
| GET | `/api/futures/forex` | 44 forex pairs across 7 categories |
| GET | `/api/futures/cot-metals` | CFTC COT hedge fund positions for 5 metals |
| GET | `/api/chart/:symbol` | OHLCV candlestick data (1M–5Y ranges) |
| GET | `/api/trading/quotes` | Live prices for 49 trading assets |
| GET | `/api/trading/signals/:symbol` | AI BUY/HOLD/SELL signal + confidence |
| GET | `/api/trading/history/:symbol` | OHLCV candles (1m/1h/4h/1d timeframes) |
| GET | `/api/trading/backtest/:symbol` | Walk-forward backtest results |
| GET | `/api/trading/news/:symbol` | Headlines + sentiment scores |
| GET | `/api/volatility/assets` | Crisis-response assets with sparklines |
| POST | `/api/volatility/briefing` | GPT-4o-mini market stress briefing |
| GET | `/api/usa-debt` | Live US national debt from Treasury API |

---

## External Data Sources

All public APIs — no key required for these.

| Data | Source |
|---|---|
| Stock prices / charts | Yahoo Finance Chart API v8 |
| Sector / Industry info | Yahoo Finance Search API |
| Indices, Commodities, Forex | Yahoo Finance (via backend) |
| US National Debt | US Treasury Fiscal Data API |
| COT Metals report | CFTC Socrata API |
| Tariff rates | Hardcoded from USTR / Commerce Dept (April 2025) |

---

## Troubleshooting

### Port already in use

```bash
# Find and kill process on port 5000
lsof -i :5000
kill -9 $(lsof -t -i:5000)

# Find and kill process on port 8081
lsof -i :8081
kill -9 $(lsof -t -i:8081)
```

### Metro cache issues

```bash
npm run expo:dev -- --clear
```

### Dependencies broken

```bash
rm -rf node_modules
npm install
```

### TypeScript errors

```bash
npx tsc --noEmit
```

### Stocks not loading

Make sure the backend is running in Terminal 1. The frontend on port 8081 calls the backend on port 5000 — both must be running simultaneously.

---

## License

MIT — free to use, modify, and distribute.
