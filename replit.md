# Monysa - replit.md

## Overview

Monysa is a React Native / Expo application for global financial market intelligence. It covers US tariff rates for 113+ countries with sector breakdowns, live global stock prices per country, a **Markets (Futures) tab** with real-time global indices (46 exchanges), commodities (23 instruments), and forex (44 currency pairs) — all dynamically fetched. Features a dark-themed financial dashboard aesthetic with a professional animated intro splash, 5-tab navigation (Markets · Trading · Exposure · Volatility · $ Debt), individual country detail pages with sector tariffs, debt data, and plain-English explanations. Apple HIG compliant: 44pt touch targets, financial disclaimers, WCAG AA contrast, slide_from_right navigation animation.

The app runs on a dual architecture: an Expo/React Native frontend (supporting iOS, Android, and web) paired with an Express.js backend server. Tariff data is hardcoded in `data/tariffs.ts` and `data/usa-debt.ts`, while stock data is dynamically fetched from Yahoo Finance APIs via the backend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo/React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture
- **Routing**: expo-router with file-based routing (`app/` directory)
  - `/` (professional animated Monysa intro splash, 3.2s)
  - `/(tabs)` (tab layout with 5 tabs: Markets · Trading · Exposure · Volatility · $ Debt)
  - `/(tabs)/index` (Exposure tab — country list ranked by tariff rate, searchable, sortable)
  - `/(tabs)/futures` (Markets tab - 3 sub-tabs: Index, Commodities, Forex with live data)
  - `/(tabs)/usa-debt` (USA national debt statistics in layman terms)
  - `/country/[code]` (country detail with sectors, debt, layman explanations)
  - `/country/stocks` (top listed stocks for a country, with sorting, market status, sector/industry info)
  - `/(tabs)/volatility` (Crisis Playbook tab — geopolitical chain of events, 3-phase market timeline, Market Stress Meter, VIX Gauge, Historical Crisis Playbook, AI Briefing, Period Toggle, Sparklines)
  - `/(tabs)/trading` (AI Trading tab — 49 assets live dashboard + AI Signals view. 2 sub-tabs: Markets dashboard with BUY/HOLD/SELL summary tiles, category chips (Commodities/Indices/Crypto/Forex), search, signal badges; Signals view with timeframe selector, direction filter, per-asset signal cards with confidence bars and reasoning)
  - `/asset/[symbol]` (Asset Detail — 5 sub-tabs: Chart (Lightweight Charts WebView + trading history), Signal (price ladder + R:R + reasoning bullets), Indicators (RSI/MACD/EMA/Bollinger/ATR values with layman descriptions), Backtest (S1/S2/S3 walk-forward results table), News (headlines + sentiment badge + aggregate sentiment))
- **State Management**: TanStack React Query for server state (stocks fetching with 4hr stale time), local hardcoded data for tariffs. `useQueries` used for parallel signal fetches across 49 assets in the trading tab.
- **Styling**: React Native StyleSheet with the single Monysa dark theme. Theme tokens in `constants/colors.ts`. Active palette retrieved via `hooks/useColors.ts` which always returns `ClassicColors`. StyleSheet.create uses static colors; component functions shadow with `const Colors = useColors()` and apply inline overrides for color-sensitive properties. `textMuted` is `#6E7A8F` (WCAG AA compliant, ~5:1 contrast on background).
- **Strategy Context**: `context/StrategyContext.tsx` exposes `useStrategy()` hook. `strategy: "1"|"2"|"3"` state persisted via AsyncStorage (`@trading_strategy`). Consumed by the Trading tab and Asset Detail screen to select which AI signal strategy to use.
- **Fonts**: Inter font family via `@expo-google-fonts/inter` (Regular, Medium, SemiBold, Bold)
- **Key UI Libraries**: react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, expo-haptics for tactile feedback, expo-linear-gradient
- **Error Handling**: Custom ErrorBoundary class component with ErrorFallback UI
- **Icons**: Ionicons (primary) and Feather (USA debt screen) from @expo/vector-icons
- **App Icon**: Professional financial-themed icon with dark navy background and teal accent elements

### Stocks Screen Features
- Sortable columns: # (rank), Price, Market Cap - tap column header to toggle asc/desc
- Market status badge: Shows "Market Open" / "Market Closed" / "Closed (Weekend)" based on real-time exchange hours
- Last refreshed timestamp: Shows relative time since data was fetched
- Sector & Industry: Displayed under stock name, enriched via Yahoo Finance search API
- Market Cap: Column available (shows "—" when data unavailable from Yahoo Finance)
- India special: NSE/BSE exchange tabs, 250 stocks per exchange (vs 69 for other countries)

### Data Files
- `data/tariffs.ts` - 111+ countries with tariff rates, 5 sectors each with sector-specific tariff rates, debt-to-USA data, verified source URLs, and laymanExplanation field. Includes helper functions: getSortedTariffs, getCountryFlag, getTariffColor, formatDate, formatBillions
- `data/usa-debt.ts` - USA national debt statistics across 4 categories (The Big Picture, What It Means For You, Who Owns Our Debt, Where The Money Goes) with plain English explanations

### Chart Integration
- **ChartModal** (`components/ChartModal.tsx`): Full-screen modal using `react-native-webview` + **Lightweight Charts v4 (MIT, open-source)** for candlestick charts. OHLCV data is fetched from our own backend (`/api/chart/:symbol`), which sources it from Yahoo Finance. No TradingView widget, no popups, no attribution required.
- **Range selector**: 1M / 3M / 6M / 1Y / 5Y buttons in the modal header; 5Y uses weekly candles.
- **Volume bars**: displayed as a histogram overlay at the bottom of the chart.
- **OHLC display**: hovering/crosshair shows O/H/L/C values for any candle.
- **Interaction**: Tap row → chart; Tap ⓘ → news modal. Both can be open independently.

### Backend (Express.js)
- **Runtime**: Node.js with TypeScript (compiled via tsx for dev, esbuild for production)
- **Server**: Express 5 with CORS configured for Replit domains and localhost
- **API Endpoints**:
  - `GET /api/stocks/:countryCode` - Fetches stocks for a country from Yahoo Finance. Uses multi-tier strategy: screener → chart API with hardcoded symbols → search API fallback. Enriches results with sector/industry via Yahoo Finance search API. Returns `lastUpdated` (ISO timestamp) and `marketStatus` (open/closed based on exchange hours). India supports `?exchange=BSE` param. Results cached 4 hours.
  - `GET /api/futures/indices` - Returns live prices for 46 world indices (S&P 500, Nikkei, DAX, Nifty, etc.) with opening hours, timezone info, and change %. Cached 10 minutes.
  - `GET /api/futures/commodities` - Returns live prices for 23 commodities (Gold, Oil, Silver, Wheat, etc.) in USD with unit info. Cached 10 minutes.
  - `GET /api/chart/:symbol?range=3mo` - Returns OHLCV candlestick data for any Yahoo Finance symbol. Ranges: 1mo/3mo/6mo/1y/5y (5y uses weekly interval). Used by ChartModal (Lightweight Charts). Cached 1 hour.
  - `GET /api/futures/cot-metals` - Returns CFTC Commitments of Traders "Managed Money" (hedge fund) positions for 5 metals (Gold, Silver, Copper, Platinum, Palladium). Fields: longContracts, shortContracts, netPosition, longPct, sentiment, weekNetChange, weekNetChangePct, reportDate. Data from CFTC Disaggregated COT report (Socrata API). Cached 4 hours (COT reports published weekly on Fridays).
  - `GET /api/futures/forex` - Returns live rates for 44 forex pairs across Majors, Crosses, Emerging, Asia-Pac, MENA, Europe, Americas categories. Cached 10 minutes.
  - `GET /api/usa-debt` - Fetches live US national debt from US Treasury Fiscal Data API. Cached 12 hours. Falls back to hardcoded values.
  - `GET /api/volatility/assets` - Returns live prices for 6 crisis-response assets (Gold, GDX, Silver, WTI Oil, XLE, US Dollar Index). Each includes volatility multiplier, direction vs gold, description, multi-period changes (1W/1M/3M), sparkline (30-day daily closes), plus top-level VIX price and band. Cached 10 minutes.
  - `POST /api/volatility/briefing` - GPT-4o-mini market stress briefing. Accepts {vix, vixBand, goldPct1M, oilPct1M, dxyPct1M}. Returns 3-4 sentence plain-English analysis. Cached 30 min per input combination.
  - `GET /api/trading/quotes` - Live prices for 39 trading assets (14 commodities, 15 indices, 10 crypto). In-memory store polled every 10 seconds from Yahoo Finance; optionally sub-second crypto via Finnhub WebSocket when `FINNHUB_API_KEY` is set.
  - `GET /api/trading/signals/:symbol?timeframe=1d&strategy=1` - AI signal (BUY/HOLD/SELL) with confidence (50–95), Entry/SL/TP levels, R:R ratio, and 5–6 reasoning bullets. Three strategies: S1 Technical, S2 Multi-Factor (volatility-adjusted), S3 News-Hybrid. Indicators: RSI, MACD, EMA12/26/50/200, Bollinger Bands, ROC, ATR. Cached 30 seconds.
  - `GET /api/trading/history/:symbol?timeframe=1d` - OHLCV candles for 5 timeframes (1m/5m/1h/4h/1d). 4h is aggregated from 1h bars. Cached 5 minutes.
  - `GET /api/trading/backtest/:symbol?timeframe=1d` - Walk-forward backtest (70/30 split) for all three strategies. Returns winRate, totalReturn, maxDrawdown, Sharpe, trades. Cached 10 minutes.
  - `GET /api/trading/news/:symbol` - Up to 8 Yahoo Finance headlines with per-article keyword-based sentiment (−100 ↔ +100) and aggregate sentiment. Cached 15 minutes.
- **Stock Data**: Maps 80+ country codes to exchange identifiers. Hardcoded symbol lists for 20+ major markets. Uses Yahoo Finance chart API (v8) for prices, search API for sector/industry enrichment. Market hours data for 45+ countries.
- **Market Status**: Real-time market open/closed detection using `Intl.DateTimeFormat` with timezone-aware exchange hours for 45+ countries.

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL
- **Schema**: Defined in `shared/schema.ts` - currently only has a `users` table
- **Current State**: The tariff data is hardcoded, not stored in the database

### Shared Code
- The `shared/` directory contains code used by both frontend and backend
- Path aliases configured: `@/*` maps to project root, `@shared/*` maps to `./shared/*`

### Build & Deploy
- **Dev**: Two processes run simultaneously - `expo:dev` for the frontend Metro bundler and `server:dev` for the Express backend
- **Production**: Static Expo web build via custom `scripts/build.js`, Express server bundled with esbuild

## External Dependencies

### Key npm Packages
- **expo** (~54.0.27): Core mobile/web framework
- **express** (^5.0.1): Backend HTTP server
- **drizzle-orm** (^0.39.3) + **drizzle-kit**: Database ORM and migration tooling
- **@tanstack/react-query** (^5.83.0): Async state management (used for stock data fetching)
- **expo-router** (~6.0.17): File-based navigation with tab support
- **react-native-reanimated** (~4.1.1): Animations
- **react-native-gesture-handler** (~2.28.0): Touch gestures
- **expo-haptics**: Haptic feedback on native platforms
- **expo-linear-gradient**: Gradient backgrounds (USA debt hero section)

### External Data Sources
- Tariff source URLs reference official US government sites (ustr.gov, commerce.gov, hts.usitc.gov) stored as reference links
- Stock data dynamically fetched from Yahoo Finance chart API (v8) for prices, search API for sector/industry - public endpoints, no API key required
- USA debt data from US Treasury Fiscal Data API (fiscal.treasury.gov) - public endpoint
- Data reflects April 2025 tariff actions
