# Moby — Claude Code Index

> **What is this file?**
> `CLAUDE.md` is loaded automatically by Claude Code at the start of every session. It is written *for the AI assistant*, not for human developers. It front-loads non-obvious facts — naming conventions that look wrong but are intentional, API field names that differ from what you'd expect, architectural invariants that span multiple files, and constraints that exist for reasons not visible in the code.
>
> **Differs from `README.md`**: README explains what the project is and how to run it. This file explains what Claude must *know* to avoid silently breaking things.

---

## Project Overview

**Moby** is a Flutter mobile app (iOS / Android) backed by a TypeScript Express API. One active frontend, one backend.

Three user-facing capabilities:
- **Tariff Exposure** — US tariff impact ranked across 113+ countries with sector breakdown
- **Live Markets** — 46 global indices, 23 commodities, 44 forex pairs with candlestick charts
- **AI Trading Signals** — BUY / HOLD / SELL with entry, SL, TP, and reasoning for 49+ assets across three strategies (S1 / S2 / S3)

**Target users**: Macro investors, professional traders, trade compliance teams.

---

## Backend (Express + TypeScript)

```
server/
  index.ts      # Express entry — CORS, body parsing, request logging
  routes.ts     # All route handlers (stocks, futures, charts, volatility, debt, search)
  trading.ts    # /api/trading/* routes (quotes, signals, backtest, news)
  storage.ts    # In-memory cache + live quote store
```

**Port**: always `5001`. macOS AirPlay owns port 5000 — do NOT use 5000.

**CORS**: allows any `http://localhost:*` origin. Null/opaque origins (e.g. WebView `loadHtmlString`) are rejected — always fetch data in Dart and embed as inline JSON; never call `fetch()` from inside WebView HTML.

**Dev server**: `npm run server:dev` uses `tsx watch` — auto-restarts on save. There is a ~1s gap during restart where in-flight requests fail; this is expected.

### API Endpoints

| Route | Purpose | Cache TTL |
|-------|---------|-----------|
| `GET /api/stocks/:countryCode` | Live country stocks | 4h |
| `GET /api/futures/indices` | 46 global indices | 10m |
| `GET /api/futures/commodities` | 23 commodities in USD | 10m |
| `GET /api/futures/forex` | 44 forex pairs | 10m |
| `GET /api/futures/cot-metals` | CFTC COT hedge fund positions (metals) | varies |
| `GET /api/chart/:symbol` | OHLCV candlestick data (range: 1mo/3mo/6mo/1y/5y) | varies |
| `GET /api/trading/quotes` | Live prices for 49 assets | 30s |
| `GET /api/trading/signals/:symbol` | AI BUY/HOLD/SELL + confidence | 30s |
| `GET /api/trading/history/:symbol` | OHLCV candles (timeframe param) | varies |
| `GET /api/trading/backtest/:symbol` | Walk-forward backtest S1/S2/S3 | varies |
| `GET /api/trading/news/:symbol` | Headlines + sentiment scores | varies |
| `GET /api/volatility/assets` | Crisis assets + sparklines | 10m |
| `POST /api/volatility/briefing` | GPT-4o-mini macro stress analysis | 30m |
| `GET /api/usa-debt` | Live US debt from Treasury API | 12h |
| `GET /api/bonds` | US Treasury yield curve (3m/5y/10y/30y + spread + status) | 10m |
| `GET /api/sectors` | 11 sector ETF performance (1W/1M change %) | 10m |
| `GET /api/search?q=QUERY` | Yahoo Finance symbol/name search | none |
| `GET /api/country-data/:code` | World Bank GDP, trade, military data | 24h |

### Exact API Response Shapes

These differ from what you'd guess — get them wrong and parsing silently fails:

```
GET /api/futures/indices      → { items: [...], lastUpdated }
GET /api/volatility/assets    → { items: [...], vix: { price, ... } }
                                  ^^^^ NOT data['assets'], NOT data['vix'] directly
GET /api/trading/backtest/:s  → { strategies: { "1": { winRate, totalReturn, maxDrawdown, sharpe, trades, tradeLog }, "2": ..., "3": ... } }
                                  ^^^^ nested under 'strategies', field is 'sharpe' not 'sharpeRatio', 'trades' not 'totalTrades'
GET /api/trading/signals/:s   → TradingSignal object  (strategy query param: "1"/"2"/"3")
GET /api/trading/news/:s      → articles array  (field is 'url', NOT 'link')
GET /api/search               → { results: [{ symbol, name, exchange, type }] }
GET /api/bonds                → { us3m, us5y, us10y, us30y, spread3m10y, curveStatus, lastUpdated }
GET /api/sectors              → { sectors: [{ emoji, name, changePercent, perf1W, perf1M }], lastUpdated }
```

### Environment Variables

```
FINNHUB_API_KEY                    optional — Finnhub WebSocket for sub-second crypto prices
AI_INTEGRATIONS_OPENAI_API_KEY     optional — GPT-4o-mini AI market briefings (volatility briefing + futures news summary)
AI_INTEGRATIONS_OPENAI_BASE_URL    optional — custom OpenAI-compatible base URL (defaults to api.openai.com)
```

Both features degrade gracefully when keys are absent.

---

## Flutter App (Moby)

Located in `moby/`. Production base URL is `https://monysa-api.fly.dev`; override with `--dart-define=API_BASE_URL=http://localhost:5001` for local dev.

### Directory Structure

```
moby/lib/
  main.dart                        # ProviderScope + runApp
  app.dart                         # MaterialApp.router + AppShell (bottom nav, 5 tabs — no theme toggle here)

  core/
    network/
      api_client.dart              # Singleton Dio (15s connect, 30s receive, LogInterceptor)
      api_endpoints.dart           # All URL builders — baseUrl from dart-define or fly.dev default
    router/
      app_router.dart              # go_router config (all routes)
    theme/
      app_colors.dart              # Legacy static const dark colors (backward compat only)
      app_palette.dart             # AppPalette ThemeExtension — dark + light instances; access via context.colors
      app_spacing.dart             # AppSpacing (s1–s8 = 4–32px) + AppRadius (xs/sm/md/lg/full)
      app_theme.dart               # AppTheme.dark + AppTheme.light (both embed AppPalette)
      app_typography.dart          # AppTypography — Inter via google_fonts

  data/
    models/
      trading_signal.dart          # QuoteItem, TradingSignal, TradeRecord, BacktestResult, NewsArticle, StockSearchResult
      market_item.dart             # MarketItem (indices / commodities / forex rows)
      candle.dart                  # Candle (OHLCV)
      price_alert.dart             # PriceAlert
    repositories/
      markets_repository.dart      # fetchIndices, fetchCommodities, fetchForex, fetchCotMetals
      trading_repository.dart      # fetchQuotes, fetchSignal, fetchHistory, fetchBacktest, fetchNews, searchStocks
      volatility_repository.dart   # fetchVolatilityAssets, fetchBriefing
      debt_repository.dart         # fetchDebt
    sources/
      tariffs_data.dart            # Hardcoded 113-country tariff data (April 2025)

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
    strategy_provider.dart         # TradingStrategy enum (s1/s2/s3) + StrategyNotifier — persisted
    alert_provider.dart            # Price alert state + 10s polling
    theme_provider.dart            # ThemeModeNotifier — persisted in SharedPreferences

  shared/widgets/
    chart_modal.dart               # Candlestick bottom sheet (Lightweight Charts v4 via WebView)
    max_width_layout.dart          # Centers + caps content at 720px for tablet/landscape
    error_view.dart                # Generic error + retry widget
    glass_card.dart                # Frosted-glass card container
    signal_badge.dart              # BUY/HOLD/SELL colored chip
    sparkline_chart.dart           # Mini fl_chart sparkline
    theme_toggle.dart              # ThemeToggleButton — pill with sun/moon icons

  utils/
    tv_symbol.dart                 # Yahoo → TradingView symbol map + TvSymbol.open(symbol)
```

### Routes

```
/splash              → SplashScreen        (restores lastTab from SharedPreferences)
/markets             → MarketsScreen
/trading             → TradingScreen
/exposure            → ExposureScreen
/volatility          → VolatilityScreen
/debt                → UsaDebtScreen
/country/:code       → CountryDetailScreen
/country/:code/stocks→ CountryStocksScreen (pass ?name=... query param)
/asset/:symbol       → AssetDetailScreen   (pass ?name=... query param)
```

### Screen Notes

**Markets** (`/markets`): sub-tabs Indices / Commodities / Forex, each with inline search. Forex is grouped by region when not searching, flat list when searching. CFTC metals section hides during search. Tap any row → `ChartModal` bottom sheet.

**Trading** (`/trading`): three sub-tabs — Dashboard / AI Signals / Alerts.
- Dashboard category chips (in order): ★ Watchlist / Commodities / Indices / Stocks / Forex / Crypto / All. "Stocks" chip switches to full-text search (debounced 400ms, calls `/api/search`). Other chips show 49 live asset rows with 30s auto-refresh.
- AI Signals: strategy selector row has `Icons.info_outline_rounded` (size 18) at right → opens `showModalBottomSheet` explaining S1/S2/S3.
- Alerts: badge count on tab icon when alerts are active.

**Volatility** (`/volatility`): Market Stress Meter, VIX gauge, crisis assets, yield curve section with info icon explaining Normal/Flat/Inverted, geopolitical infographic, historical crisis playbook, AI briefing, static economic calendar (FOMC/CPI/NFP/Jackson Hole).

**US Debt** (`/debt`): no AppBar — custom hero layout. `ThemeToggleButton` placed as `Positioned(top: topPad + 10, right: 14)` inside a `Stack`. Four category tabs: Big Picture / Personal / Foreign Holders / Spending.

**Country Stocks** (`/country/:code/stocks`): India has NSE / BSE exchange tabs. Tap any row → `/asset/:symbol` (full 5-tab detail), not a chart modal.

**Asset Detail** (`/asset/:symbol`): 5 sub-tabs — Chart / Signal / Indicators / Backtest / News. Chart tab is an inline `WebViewController` (not a modal); a fullscreen icon opens `ChartModal` on top. AppBar has TradingView icon + timeframe selector.

---

## State Management

- **Server state**: `FutureProvider.autoDispose[.family]` — no polling except trading quotes (30s timer in Trading screen)
- **Strategy**: `NotifierProvider<StrategyNotifier, TradingStrategy>` — persisted in SharedPreferences
  - `strategy.label` → `"S1"/"S2"/"S3"` — UI display only, **never pass to API**
  - `strategy.serverParam` → `"1"/"2"/"3"` — always use this for API calls
- **Theme**: `NotifierProvider<ThemeModeNotifier, ThemeMode>` — persisted in SharedPreferences
- **Alerts**: `alertProvider` — price alerts with 10s polling timer when alerts exist

---

## Theme System

Access colors via `context.colors` (the `AppPaletteX` extension on `BuildContext` in `app_palette.dart`):

```dart
final c = context.colors;
// c.background  c.surface  c.accent  c.danger  c.warning  c.textPrimary  c.textSecondary
// c.signalColor(direction) → BUY=teal, SELL=red, HOLD=amber
// c.signalDim(direction)   → dimmed variants
```

| Token | Dark | Light |
|-------|------|-------|
| `background` | `#000000` | `#FFFFFF` |
| `surface` | `#0A0A0A` | `#F5F7FA` |
| `accent` | `#00D4AA` | `#00C49A` |
| `danger` | `#FF4D6A` | `#E8384F` |
| `warning` | `#FFB84D` | `#E6952A` |

**AppTypography**: Inter via google_fonts. Always call `.copyWith(color: c.textPrimary)` — the base color is a dark-mode literal hardcoded in the class, not context-aware.

```dart
AppTypography.xs/sm/md/lg/xl/xl2/xl3/xl4        // 10/11/12/14/16/18/20/24px
AppTypography.labelSm/labelMd/labelLg            // w500
AppTypography.headingSm/headingMd/headingLg/headingXl  // w600–w700
AppTypography.numericLg/numericXl                // tabular figures
```

```dart
AppSpacing.s1=4  s2=6  s3=8  s4=12  s5=16  s6=20  s7=24  s8=32
AppRadius.xs=6   sm=8  md=12  lg=16  full=100
```

**ThemeToggleButton**: pill-shaped widget with sun (`Icons.wb_sunny_rounded`) and moon (`Icons.nightlight_round`) icons. Active icon gets `accent.withAlpha(50)` background via `AnimatedContainer` (180ms). Placement rules:
- Markets, Trading, Exposure, Volatility → `AppBar(actions: [ThemeToggleButton()])`
- US Debt → `Positioned(top: topPad + 10, right: 14)` in a `Stack` (no AppBar)
- Bottom nav (`app.dart`) → no toggle, only the 5 nav tabs
- **Always add `ThemeToggleButton` to AppBar actions on any new screen.**

---

## Tablet / Landscape Layout

`MaxWidthLayout` centers content and caps it at 720px. Currently applied to: Trading, Exposure, Volatility, US Debt. Markets and detail screens are full-width. Wrap any new single-column screen in `MaxWidthLayout`.

---

## ChartModal — Critical Constraints

1. **Never call `fetch()` inside WebView HTML.** `loadHtmlString` yields a null/opaque origin; `fetch()` to `localhost:5001` is blocked by CORS. Always fetch candle data in Dart, then embed as `const raw = $candleJson;` in the HTML string. Applies to both `ChartModal` and the inline `_ChartTab` in Asset Detail.

2. **Always set `enableDrag: false`** in `showModalBottomSheet` — chart pan/pinch events bubble up and dismiss the sheet otherwise. The X button is the only close path.

3. **Charts are always dark** — WebView HTML uses `#0a0a0a` background regardless of app theme.

---

## TradingView Integration

`utils/tv_symbol.dart` — `TvSymbol.open(yahooSymbol)`:
1. Maps known Yahoo Finance symbols to TradingView identifiers (major US/EU/Asia indices, gold/silver/oil/copper/platinum futures, BTC/ETH/SOL/XRP, major forex pairs, DXY)
2. Falls back to `finance.yahoo.com/quote/$symbol` for unmapped symbols
3. Opens via `url_launcher` in `LaunchMode.externalApplication`

---

## Known Pitfalls

| Pitfall | Wrong | Right |
|---------|-------|-------|
| Strategy sent to API | `strategy.label` → "S1" | `strategy.serverParam` → "1" |
| Backtest response key | `data['1']` | `data['strategies']['1']` |
| Backtest field names | `sharpeRatio`, `totalTrades` | `sharpe`, `trades` |
| News article URL field | `article['link']` | `article['url']` |
| Volatility items key | `data['assets']` | `data['items']` |
| Volatility VIX field | `data['vix']` (direct number) | `data['vix']['price']` |
| Server port | 5000 (AirPlay) | 5001 |
| Adding ASSET_MAP guards to trading endpoints | re-adding the guard | These endpoints accept any valid Yahoo Finance ticker — do not add the guard back |
| Dart raw strings with apostrophes | `r'it\'s fine'` (does NOT work) | `"it's fine"` with `\$` for dollar-sign escapes |
