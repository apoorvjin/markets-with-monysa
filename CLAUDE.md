# Monysa + Moby — Claude Code Index

## What Is This Project?

Two apps sharing one Express backend:

1. **Monysa** — original React Native / Expo frontend
2. **Moby** — Flutter port of Monysa (`moby/` subfolder), actively developed

Both answer the same three user questions:
- **Tariff exposure** — US tariff impact across 113+ countries with sector breakdown
- **Live markets** — 46 global indices, 23 commodities, 44 forex pairs
- **AI trading signals** — BUY/HOLD/SELL with entry, SL, TP for 49+ assets

**Target users**: Macro investors, professional traders, trade compliance teams, policy analysts.

---

## Shared Backend (Express)

```
server/
  index.ts      # Express entry, CORS, request logging
  routes.ts     # All API handlers (stocks, futures, charts, volatility, debt, search)
  trading.ts    # Trading signals, quotes, backtest, news (mounted at /api/trading)
  storage.ts    # In-memory cache + quote store
```

**Port**: 5001 locally (`npm run server:dev`). macOS AirPlay occupies port 5000 — do NOT use 5000.

**CORS**: Allows any `http://localhost:*` origin. Null/opaque origins (e.g. WebView loadHtmlString) are rejected — always fetch data server-side in Dart and embed as JSON.

### All API Endpoints

| Route | Purpose | Cache |
|-------|---------|-------|
| `GET /api/stocks/:countryCode` | Live country stocks | 4h |
| `GET /api/futures/indices` | 46 global indices | 10m |
| `GET /api/futures/commodities` | 23 commodities in USD | 10m |
| `GET /api/futures/forex` | 44 forex pairs | 10m |
| `GET /api/futures/cot-metals` | CFTC COT hedge fund positions | varies |
| `GET /api/chart/:symbol` | OHLCV candlestick data (range: 1mo/3mo/6mo/1y/5y) | varies |
| `GET /api/trading/quotes` | Live prices for 49 assets | 30s |
| `GET /api/trading/signals/:symbol` | AI BUY/HOLD/SELL + confidence | 30s |
| `GET /api/trading/history/:symbol` | OHLCV candles (timeframe param) | varies |
| `GET /api/trading/backtest/:symbol` | Walk-forward backtest S1/S2/S3 | varies |
| `GET /api/trading/news/:symbol` | Headlines + sentiment scores | varies |
| `GET /api/volatility/assets` | Crisis assets + sparklines | 10m |
| `POST /api/volatility/briefing` | GPT-4o-mini stress analysis | 30m |
| `GET /api/usa-debt` | Live US debt from Treasury API | 12h |
| `GET /api/bonds` | US Treasury yield curve (3m/5y/10y/30y + spread + status) | 10m |
| `GET /api/sectors` | 11 sector ETF performance (1W/1M change %) | 10m |
| `GET /api/search?q=QUERY` | Yahoo Finance stock search (symbol/name) | none |
| `GET /api/country-data/:code` | World Bank GDP, trade, military data | varies |

### Critical API Response Shapes

```
GET /api/futures/indices      → { items: [...], lastUpdated }
GET /api/volatility/assets    → { items: [...], vix: { price, ... } }
GET /api/trading/backtest/:s  → { strategies: { "1": { winRate, totalReturn, maxDrawdown, sharpe, trades, tradeLog }, "2": ..., "3": ... } }
GET /api/trading/signals/:s   → TradingSignal object (strategy param: "1"/"2"/"3" not "S1"/"S2"/"S3")
GET /api/search               → { results: [{ symbol, name, exchange, type }] }
GET /api/bonds                → { us3m, us5y, us10y, us30y, spread3m10y, curveStatus, lastUpdated }
GET /api/sectors              → { sectors: [{ emoji, name, changePercent, perf1W, perf1M }], lastUpdated }
```

### Environment Variables
- `FINNHUB_API_KEY` — optional; Finnhub WebSocket for sub-second crypto prices
- `OPENAI_API_KEY` — optional; GPT-4o-mini AI market briefings

---

# Monysa — React Native / Expo Frontend

```
app/                        # All screens (Expo Router)
  _layout.tsx               # Root stack: error boundary, Query, contexts, fonts
  index.tsx                 # 3.2s animated splash → randomly selects one of 5 tabs
  (tabs)/
    _layout.tsx             # Tab bar (5 tabs with Ionicons)
    futures.tsx             # Markets tab: Indices / Commodities / Forex
    trading.tsx             # Trading tab: Dashboard / AI Signals / Alerts
    index.tsx               # Exposure tab: 113+ country tariff rankings
    volatility.tsx          # Volatility tab: crisis playbook, VIX, stress meter
    usa-debt.tsx            # US Debt tab: live Treasury data + explanations
  country/
    [code].tsx              # Country detail: tariff, sectors, financial exposure
    stocks.tsx              # Country's live top stocks (sortable table)
  asset/
    [symbol].tsx            # Asset detail: Chart / Signal / Indicators / Backtest / News

components/
  ChartModal.tsx            # Lightweight Charts v4 candlestick modal (1M–5Y)
  AlertBanner.tsx           # Dismissible price alert notification
  ErrorBoundary.tsx         # Catches crashes, shows recovery UI

constants/
  colors.ts                 # Dark theme palette (teal accent #00D4AA)
  glassTheme.ts             # Glass morphism style helpers
  typeuiTokens.ts           # Typography, spacing, radius design tokens

context/
  StrategyContext.tsx        # AI strategy (S1/S2/S3) selection, persisted
  AlertContext.tsx           # Price alert management + 10s polling

lib/
  query-client.ts           # QueryClient config + getApiUrl() + apiRequest()

data/
  tariffs.ts                # Hardcoded: 113 countries, tariff rates, sectors (April 2025)
  usa-debt.ts               # Hardcoded: US debt categories with layman explanations
```

**Stack**: Expo 54 + React Native 0.81, expo-router, TanStack React Query, AsyncStorage, Lightweight Charts v4 via WebView.

**Theme**: Dark only. `EXPO_PUBLIC_DOMAIN` env var sets the backend host.

---

# Moby — Flutter Port

Active Flutter port of Monysa. Located in `moby/`. Shares the same Express backend at `localhost:5001`.

## Stack

| Layer | Choice |
|-------|--------|
| Navigation | `go_router` ^14.2.0 |
| State management | `flutter_riverpod` ^2.5.1 |
| HTTP | `dio` ^5.4.3+1 |
| Local persistence | `shared_preferences` ^2.3.2 |
| Fonts | `google_fonts` ^6.2.1 (Inter) |
| Sparklines | `fl_chart` ^0.68.0 |
| Candlestick charts | `webview_flutter` ^4.8.0 (Lightweight Charts v4) |
| Number formatting | `intl` ^0.19.0 |
| Loading skeletons | `shimmer` ^3.0.0 |
| External links | `url_launcher` ^6.x |

## Directory Structure

```
moby/lib/
  main.dart                          # ProviderScope + runApp
  app.dart                           # MaterialApp.router + AppShell (bottom nav — 5 tabs only, no toggle here)

  core/
    network/
      api_client.dart                # Singleton Dio (15s connect, 30s receive, LogInterceptor)
      api_endpoints.dart             # All URL builders; baseUrl = http://localhost:5001
    router/
      app_router.dart                # go_router config (all routes)
    theme/
      app_colors.dart                # Legacy static const dark colors (backward compat)
      app_palette.dart               # AppPalette ThemeExtension — dark + light instances
      app_spacing.dart               # AppSpacing (s1–s8=4–32) + AppRadius (xs/sm/md/lg/full)
      app_theme.dart                 # AppTheme.dark + AppTheme.light (both include AppPalette)
      app_typography.dart            # AppTypography — Inter via google_fonts

  data/
    models/
      trading_signal.dart            # QuoteItem, TradingSignal, TradeRecord,
                                     #   BacktestResult, NewsArticle, StockSearchResult
      market_item.dart               # MarketItem (indices/commodities/forex rows)
      candle.dart                    # Candle (OHLCV)
      price_alert.dart               # PriceAlert
    repositories/
      markets_repository.dart        # fetchIndices, fetchCommodities, fetchForex, fetchCotMetals
      trading_repository.dart        # fetchQuotes, fetchSignal, fetchHistory,
                                     #   fetchBacktest, fetchNews, searchStocks
      volatility_repository.dart     # fetchVolatilityAssets, fetchBriefing
      debt_repository.dart           # fetchDebt
    sources/
      tariffs_data.dart              # Hardcoded 113-country tariff data (April 2025)

  features/
    splash/splash_screen.dart
    markets/markets_screen.dart
    trading/trading_screen.dart
    exposure/exposure_screen.dart
    volatility/volatility_screen.dart
    usa_debt/usa_debt_screen.dart
    country/country_detail_screen.dart
    country/country_stocks_screen.dart
    asset/asset_detail_screen.dart

  providers/
    strategy_provider.dart           # TradingStrategy enum (s1/s2/s3) + StrategyNotifier
    alert_provider.dart              # Price alert state
    theme_provider.dart              # ThemeModeNotifier — persists dark/light in SharedPreferences

  shared/widgets/
    chart_modal.dart                 # Candlestick bottom sheet (Lightweight Charts v4 via WebView)
    max_width_layout.dart            # Centers + caps content at 720px for tablet/landscape
    error_view.dart                  # Generic error + retry widget
    glass_card.dart                  # Frosted-glass card container
    signal_badge.dart                # BUY/HOLD/SELL colored chip
    sparkline_chart.dart             # Mini fl_chart sparkline
    theme_toggle.dart                # ThemeToggleButton — pill with sun/moon icons, placed in AppBar actions

  utils/
    tv_symbol.dart                   # Yahoo→TradingView symbol map + TvSymbol.open(symbol)
```

## Routing

```
/splash                    → SplashScreen
/markets                   → MarketsScreen
/trading                   → TradingScreen
/exposure                  → ExposureScreen
/volatility                → VolatilityScreen
/debt                      → UsaDebtScreen
/country/:code             → CountryDetailScreen
/country/:code/stocks      → CountryStocksScreen (pass ?name=... query param)
/asset/:symbol             → AssetDetailScreen   (pass ?name=... query param)
```

## Screens

### Splash (`/splash`)
Animated intro. Reads `lastTab` from SharedPreferences and navigates there (defaults to `/markets` on first launch). The last-visited tab is saved whenever the user taps a bottom-nav item.

### Markets (`/markets`)
- AppBar has `ThemeToggleButton` in actions (top-right)
- Sub-tabs: Indices / Commodities / Forex
- Each sub-tab has an inline search bar — filters by name or symbol (case-insensitive). CFTC metals section hides when searching; Forex switches from grouped-by-region to flat list when searching.
- Indices: 46 global indices, price + % change, open/close status
- CFTC Metals: Gold, Silver, Copper, Platinum, Palladium long/short sentiment
- Forex: grouped by region (Majors, Crosses, Emerging, Asia-Pac, MENA, Europe, Americas)
- Tap any row → `ChartModal` bottom sheet

### Trading (`/trading`)
- AppBar has `ThemeToggleButton` in actions (top-right)

Sub-tabs: **Dashboard** / **AI Signals** / **Alerts**

**Dashboard**:
- Category filter chips (in order): **★ Watchlist** (star icon, `Icons.star_rounded`) / Commodities / Indices / Stocks / Forex / Crypto / All
  - Watchlist chip shows a star icon instead of text (narrower chip); star is `c.warning` when inactive, `c.background` when active
- When "Stocks" is selected: full-text search UI (debounced 400ms)
  - Calls `GET /api/search?q=...` via `TradingRepository.searchStocks()`
  - Results: symbol badge, name, exchange tag, asset type
  - Tap → `/asset/:symbol` (same 5-tab detail screen)
- Other categories: 49 live asset rows (price, % change, signal badge, confidence bar, sparkline)
- Auto-refreshes quotes every 30s

**AI Signals**: timeframe selector (1m/1h/4h/1d), direction filter, signal cards with reasoning; strategy selector row has an `Icons.info_outline_rounded` icon (size 18) at the right that opens a `showModalBottomSheet` explaining S1/S2/S3 strategies

**Alerts**: set above/below price alerts, badge count on tab icon

### Exposure (`/exposure`)
- AppBar has `ThemeToggleButton` in actions (top-right)
- 113+ countries ranked by US tariff rate
- Searchable + sortable; tap → `/country/:code`

### Volatility (`/volatility`)
- AppBar has `ThemeToggleButton` in actions (top-right)
- Market Stress Meter (Low/Moderate/High/Extreme), VIX gauge
- Crisis-response assets (Gold, GDX, Silver, WTI, XLE, DXY) with sparklines
- **Yield Curve** section (`GET /api/bonds`) — shows US3M/5Y/10Y/30Y yields, 3M–10Y spread, curve status (Normal/Flat/Inverted); has an `Icons.info_outline_rounded` (size 16) icon next to the "Yield Curve" title that opens a `showModalBottomSheet` explaining Normal/Flat/Inverted and what the 3M-10Y spread means
- Geopolitical chain of events infographic
- Historical crisis playbook (2008, COVID, 1973, Ukraine, Euro Crisis)
- AI Market Briefing via GPT-4o-mini (30-min cache)
- **Economic Calendar** — static list of upcoming macro events (FOMC, CPI, NFP, Jackson Hole); each row shows date, title, impact badge (High=red / Medium=amber), category color dot (Fed=teal, Inflation=amber, Jobs=teal, Earnings=purple)

### US Debt (`/debt`)
- No AppBar — custom hero layout with status-bar-height top padding. `ThemeToggleButton` placed as `Positioned(top: topPad + 10, right: 14)` inside a `Stack` wrapping the `Scaffold` body.
- Live Treasury data; 4 category tabs:
  - **Big Picture** (teal accent) — total debt, debt/GDP, deficit, interest
  - **Personal** (amber accent) — per-citizen, per-taxpayer, unfunded obligations
  - **Foreign Holders** (blue accent) — Japan, China, UK, Canada, India + total
  - **Spending** (purple accent) — Social Security, Medicare/Medicaid, Defense, Interest
- Hero section: live debt counter, daily growth, last-updated

### Country Detail (`/country/:code`)
- Tariff rate, 5 sectors with rates + USTR links
- Financial exposure: Treasury holdings, trade deficit, FDI
- "Top Listed Stocks" → `/country/:code/stocks`

### Country Stocks (`/country/:code/stocks`)
- Sortable by rank/price/market cap
- India special: NSE / BSE exchange tabs
- Tap any row → `/asset/:symbol` (full 5-tab Asset Detail), not just a chart modal

### Asset Detail (`/asset/:symbol`)
- AppBar actions: **TradingView** `IconButton` (opens in external browser via `TvSymbol.open()`), **timeframe** selector popup (1m / 1h / 4h / 1d)
- 5 sub-tabs: **Chart** / **Signal** / **Indicators** / **Backtest** / **News**
- **Chart**: inline `WebViewController` rendering Lightweight Charts v4 directly in the tab — no modal required. Range selector (1M/3M/6M/1Y/5Y) at top; "fullscreen" icon still opens `ChartModal`. Data is fetched in Dart and embedded as JSON (same CORS workaround as ChartModal).
- **Signal**: entry, SL, TP, risk:reward for selected strategy + reasoning bullets
- **Indicators**: live RSI-14, MACD, EMA-12/26/50/200, Bollinger Bands, ATR + interpretations
- **Backtest**: equity curve `LineChart` (fl_chart, h=120, accent/danger colored by P&L) above win-rate bar + expandable trade log per strategy (S1/S2/S3)
- **News**: Yahoo Finance headlines + per-article and aggregate sentiment

## State Management

- **Server state**: `FutureProvider.autoDispose[.family]` — no auto-polling except trading quotes (30s timer)
- **Strategy**: `NotifierProvider<StrategyNotifier, TradingStrategy>` — persisted in SharedPreferences
  - `strategy.label` → "S1"/"S2"/"S3" (UI display only)
  - `strategy.serverParam` → "1"/"2"/"3" (use this for API calls)
- **Theme**: `NotifierProvider<ThemeModeNotifier, ThemeMode>` — persisted in SharedPreferences
- **Alerts**: `alertProvider` — price alerts with 10s polling when active

## Theme System

### AppPalette (ThemeExtension)
Access via `context.colors` (from `AppPaletteX` extension in `app_palette.dart`).

```dart
// Usage in any build method:
final c = context.colors;
// c.background, c.surface, c.accent, c.danger, c.warning, c.textPrimary, ...
// c.signalColor(direction) → BUY=teal, SELL=red, HOLD=amber
// c.signalDim(direction)   → dimmed variants
```

**Dark palette** (default): black background, `#00D4AA` teal accent
**Light palette**: white background, `#00C49A` teal accent (slightly deeper for contrast)

| Token | Dark | Light |
|-------|------|-------|
| `background` | `#000000` | `#FFFFFF` |
| `surface` | `#0A0A0A` | `#F5F7FA` |
| `accent` | `#00D4AA` | `#00C49A` |
| `danger` | `#FF4D6A` | `#E8384F` |
| `warning` | `#FFB84D` | `#E6952A` |

### AppTypography
Inter via google_fonts. Always call `.copyWith(color: c.textPrimary)` — the base color is a dark-mode fallback literal, not context-aware.

```dart
AppTypography.xs/sm/md/lg/xl/xl2/xl3/xl4   // 10/11/12/14/16/18/20/24px
AppTypography.labelSm/labelMd/labelLg       // w500 variants
AppTypography.headingSm/headingMd/headingLg/headingXl  // w600–w700
AppTypography.numericLg/numericXl           // tabular figures
```

### AppSpacing / AppRadius
```dart
AppSpacing.s1=4  s2=6  s3=8  s4=12  s5=16  s6=20  s7=24  s8=32
AppRadius.xs=6   sm=8  md=12  lg=16  full=100
```

### Theme Toggle
`ThemeToggleButton` (`shared/widgets/theme_toggle.dart`) is a pill-shaped `GestureDetector` container with sun (`Icons.wb_sunny_rounded`) and moon (`Icons.nightlight_round`) icons side by side. The active mode's icon is highlighted with `palette.accent.withAlpha(50)` background using `AnimatedContainer` (180ms).

Placement per screen:
- **Markets, Trading, Exposure, Volatility**: in `AppBar(actions: [ThemeToggleButton()])`
- **US Debt**: no AppBar — placed as `Positioned(top: topPad + 10, right: 14)` inside a `Stack` wrapping the Scaffold body
- **Bottom nav** (`app.dart` `_BottomBar`): does NOT have a toggle tab — only the 5 navigation tabs

Toggles `themeModeProvider` which persists to SharedPreferences. Always add `ThemeToggleButton` to the AppBar actions of any new screen.

## Tablet / Landscape Layout

`MaxWidthLayout` (in `shared/widgets/max_width_layout.dart`) centers content and caps it at 720px. Applied to the `body` of: Trading, Exposure, Volatility, US Debt. Markets and detail screens are full-width. Any new screen that is single-column content should also wrap in `MaxWidthLayout`.

## TradingView Integration

`utils/tv_symbol.dart` contains `TvSymbol.open(yahooSymbol)` which:
1. Maps known Yahoo Finance symbols (indices, commodities, crypto, forex) to TradingView identifiers via a const map
2. Falls back to `finance.yahoo.com/quote/$symbol` for unmapped symbols
3. Opens using `url_launcher` in `LaunchMode.externalApplication`

Symbol map covers: major US indices (`^GSPC`, `^DJI`, `^IXIC`), European/Asian indices, gold/silver/oil/copper/platinum futures, BTC/ETH/SOL/XRP, major forex pairs, DXY.

## ChartModal — Critical Implementation Notes

1. **No JS fetch inside WebView** — `loadHtmlString` gives the page a null/opaque origin. `fetch()` to `localhost:5001` is blocked by CORS. Fix: fetch candle data in Dart via `ApiClient`, embed as `const raw = $candleJson;` in the HTML. Never add a runtime `fetch()` inside the WebView HTML. This applies to both `ChartModal` and the inline `_ChartTab` in Asset Detail.

2. **`enableDrag: false`** — chart pan/pinch events bubble up and dismiss the bottom sheet. Always set `enableDrag: false` in `showModalBottomSheet`. The X button is the only close mechanism.

3. **Chart always dark** — WebView HTML uses `#0a0a0a` background regardless of app theme. Candlestick charts look better dark.

4. **Inline chart vs modal** — Asset Detail's Chart tab renders inline (no modal); all other entry points (Markets row tap, Country Stocks row tap) open `ChartModal`. The inline tab also has a fullscreen icon that opens the modal on top.

## Known Pitfalls

- **Strategy server param**: use `strategy.serverParam` ("1"/"2"/"3"), never `strategy.label` ("S1"/"S2"/"S3"). The server rejects label format.
- **Backtest nesting**: response is `data['strategies']['1']` not `data['1']`. Field names are `sharpe` (not `sharpeRatio`) and `trades` (not `totalTrades`).
- **News field**: server returns `url` (not `link`) in news articles.
- **Volatility response**: `data['items']` (not `data['assets']`) and `data['vix']['price']` (not `data['vix']`).
- **macOS port 5000**: occupied by AirPlay (AirTunes). Server runs on 5001. Never change `baseUrl` to 5000.
- **Dart raw strings**: `r'...'` cannot contain apostrophes — `'` terminates the string and `\'` is NOT an escape. Use `"..."` double-quoted strings for text containing apostrophes. Use `\$` to escape dollar signs in double-quoted strings.
- **Trading endpoints accept any symbol**: `/api/trading/signals/:symbol`, `/history/:symbol`, `/backtest/:symbol`, and `/news/:symbol` no longer guard against unknown symbols — they work for any valid Yahoo Finance ticker (not just the 45 pre-defined ASSET_MAP assets). Do NOT re-add `ASSET_MAP.has(symbol)` guards.
- **tsx watch is enabled**: `server:dev` uses `tsx watch` — the server auto-restarts on any change to `server/*.ts`. There is a ~1s gap during restart where in-flight requests fail, which is expected in dev.

## Running Moby

```bash
# 1. Start backend (required first)
cd /Users/apoorvjin/markets-with-monysa
npm run server:dev          # starts on :5001

# 2. Run Flutter
cd moby
flutter run                 # iOS simulator, Android, or Chrome
flutter analyze --no-fatal-infos  # zero errors expected
```

---

# Monysa — Existing Documentation

| File | Contents |
|------|----------|
| `README.md` | Setup, installation, scripts, API endpoints, troubleshooting |
| `monysa.md` | Feature walkthrough, data refresh rates, design principles |
| `product.md` | Product spec, exec overview, technical architecture |
| `manual.md` | Operations manual: deployment, monitoring, scaling |
| `roadmap.md` | Planned features and priorities |
| `replit.md` | Replit-specific deployment guide and env var setup |
