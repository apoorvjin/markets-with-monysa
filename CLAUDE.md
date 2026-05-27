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
  index.ts              # Express entry — CORS, body parsing, request logging, HMAC signing middleware
  routes.ts             # Economy routes (stocks, futures, charts, volatility, debt, search, bonds, sectors)
  trading.ts            # /api/trading/* routes (quotes, signals, backtest, news, scanner, analyst-note, fundamentals)
  plan-enforcement.ts   # Shared plan/entitlement helpers (DevicePlan type + devicePlanMap)

  routes/               # Modular route files registered by index.ts
    billing.ts          # POST /api/billing/webhook (RevenueCat)
    economy.ts          # search, usa-debt, country-data, bonds, sectors, crises
    exposure.ts         # GET /api/exposure/analysis (Anthropic, plan-gated: Insight+)
    heatmap.ts          # GET /api/heatmap, GET /api/heatmap/assets
    markets.ts          # stocks, futures, chart, central-bank-rates
    shared.ts           # Shared utilities

  providers/            # Chart data provider abstraction
    index.ts            # Provider registry (currently: yahoo only)
    types.ts            # Interface definitions: OHLCVCandle, PriceData, RangeData, ChartProvider
    yahoo.ts            # Yahoo Finance provider implementation
```

**Port**: always `5001`. macOS AirPlay owns port 5000 — do NOT use 5000.

**CORS**: allows any `http://localhost:*` origin. Null/opaque origins (e.g. WebView `loadHtmlString`) are rejected — always fetch data in Dart and embed as inline JSON; never call `fetch()` from inside WebView HTML.

**Dev server**: `npm run server:dev` uses `tsx watch` — auto-restarts on save. There is a ~1s gap during restart where in-flight requests fail; this is expected.

**HMAC signing middleware**: When `APP_SIGNING_SECRET` is set, every API request must include an `X-Signature` header (`"<timestamp>.<hmac>"`). When the secret is absent (local dev), signing is bypassed and all devices are unrestricted (`enterprise` plan).

### Plan / Entitlement Enforcement

`plan-enforcement.ts` exports:
- `DevicePlan` type: `"free" | "pro" | "insight" | "enterprise"`
- `devicePlanMap: Map<string, DevicePlan>` — populated by RevenueCat webhook events
- `getDevicePlan(req)` — reads `X-Device-ID` header, returns plan (defaults to `"free"`)
- `isPro(plan)` — true for pro/insight/enterprise
- `isInsight(plan)` — true for insight/enterprise

In dev mode (`APP_SIGNING_SECRET` absent) every device returns `"enterprise"` — no gates fire.

### API Endpoints

| Route | Purpose | Cache TTL |
|-------|---------|-----------|
| `GET /api/stocks/:countryCode` | Live country stocks | 4h |
| `GET /api/futures/indices` | 46 global indices | 10m |
| `GET /api/futures/commodities` | 23 commodities in USD | 10m |
| `GET /api/futures/forex` | 44 forex pairs | 10m |
| `GET /api/futures/cot-metals` | CFTC COT hedge fund positions (metals) | varies |
| `GET /api/chart/:symbol` | OHLCV candlestick data (range: 1mo/3mo/6mo/1y/5y) | varies |
| `GET /api/central-bank-rates` | Central bank policy rates (static data) | 6h |
| `GET /api/trading/strategies` | Strategy definitions for S1/S2/S3 | static |
| `GET /api/trading/quotes` | Live prices for 49 assets | 30s |
| `GET /api/trading/signals/:symbol` | AI BUY/HOLD/SELL + confidence | 30s |
| `GET /api/trading/analyst-note/:symbol` | AI analyst note (plan-gated: Pro+) | varies |
| `GET /api/trading/history/:symbol` | OHLCV candles (timeframe param) | varies |
| `GET /api/trading/backtest/:symbol` | Walk-forward backtest S1/S2/S3 | varies |
| `GET /api/trading/news/:symbol` | Headlines + sentiment scores | varies |
| `GET /api/trading/fundamentals/:symbol` | Stock fundamentals | varies |
| `GET /api/trading/scanner/10x/assets` | 10X scanner v1 — 49 base assets | varies |
| `GET /api/trading/scanner/10x/stocks` | 10X scanner v1 — auto-discovered equities | varies |
| `GET /api/trading/scanner/10x-v2/assets` | 10X scanner v2 — Pine Script aligned assets | varies |
| `GET /api/trading/scanner/10x-v2/stocks` | 10X scanner v2 — Pine Script aligned equities | varies |
| `GET /api/trading/scanner/backtest/:type` | Historical signal backtest (v1/v2 via ?version=) | 24h |
| `GET /api/trading/scanner/best-setups` | Best setups filter (?version=&type=&minWinRate=) | varies |
| `GET /api/volatility/assets` | Crisis assets + sparklines | 10m |
| `POST /api/volatility/briefing` | GPT-4o-mini macro stress analysis | 30m |
| `GET /api/usa-debt` | Live US debt from Treasury API | 12h |
| `GET /api/bonds` | US Treasury yield curve (3m/5y/10y/30y + spread + status) | 30m |
| `GET /api/sectors` | 11 sector ETF performance (1W/1M change %) | 15m |
| `GET /api/search?q=QUERY` | Yahoo Finance symbol/name search | none |
| `GET /api/country-data/:code` | World Bank GDP, trade, military data | 24h |
| `GET /api/crises` | Historical crisis playbook data (static) | — |
| `GET /api/heatmap` | Performance heatmap (sectors/regions) | 15m |
| `GET /api/heatmap/assets` | Heatmap per-category assets (?category=) | 30m |
| `GET /api/exposure/analysis` | AI tariff exposure analysis (Insight+ plan) | 24h |
| `POST /api/billing/webhook` | RevenueCat subscription event webhook | — |

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
GET /api/crises               → { crises: [...], dataAsOf: "May 2026" }
GET /api/heatmap              → { tiles: [...], lastUpdated }
GET /api/heatmap/assets       → { tiles: [...], category, lastUpdated }
GET /api/exposure/analysis    → { comps: [{ name, ticker, revenueExposurePct, earningsImpactPct }], summary }
```

Plan-gated endpoints return `403 { error: "...", code: "PLAN_REQUIRED" }` when the device lacks entitlement.

### Environment Variables

```
FINNHUB_API_KEY                    optional — Finnhub WebSocket for sub-second crypto prices
AI_INTEGRATIONS_OPENAI_API_KEY     optional — GPT-4o-mini AI market briefings (volatility briefing + futures news summary)
AI_INTEGRATIONS_OPENAI_BASE_URL    optional — custom OpenAI-compatible base URL (defaults to api.openai.com)
ANTHROPIC_API_KEY                  optional — Claude Haiku for AI analyst notes + AI tariff exposure analysis
ALPHA_VANTAGE_API_KEY              optional — Alpha Vantage for fundamentals/historical data fallback
APP_SIGNING_SECRET                 optional — enables HMAC request signing; absent = dev mode (all devices unrestricted)
REVENUECAT_WEBHOOK_SECRET          optional — Bearer token for RevenueCat billing webhook
```

All features degrade gracefully when keys are absent.

---

## Flutter App (Moby)

Located in `moby/`. Production base URL is `https://monysa-api.fly.dev`; override with `--dart-define=API_BASE_URL=http://localhost:5001` for local dev.

### dart-define Variables

```
API_BASE_URL           override server URL (default: https://monysa-api.fly.dev)
APP_SIGNING_SECRET     HMAC signing secret; absent = dev mode (no X-Signature header sent)
DEV_PLAN               bypass plan gates in dev/TestFlight builds (values: pro | insight | enterprise)
REVENUECAT_IOS_KEY     RevenueCat iOS API key
REVENUECAT_ANDROID_KEY RevenueCat Android API key
SENTRY_DSN             Sentry DSN; absent = development mode (errors not forwarded)
```

### Directory Structure

```
moby/lib/
  main.dart                        # ProviderScope + runApp + RevenueCat + Sentry init
  app.dart                         # MaterialApp.router (title: 'Monysa') + AppShell (bottom nav, 6 tabs)

  core/
    network/
      api_client.dart              # Singleton Dio (15s connect, 30s receive, LogInterceptor + SigningInterceptor)
      api_endpoints.dart           # All URL builders — baseUrl from dart-define or fly.dev default
      device_id.dart               # DeviceId — generates + persists UUID; sent as X-Device-ID header
      request_signer.dart          # RequestSigner — HMAC-SHA256 sign() via APP_SIGNING_SECRET dart-define
    router/
      app_router.dart              # go_router config (all routes)
    restart_widget.dart            # RestartWidget — wraps app for forced hot restart (used by chart provider switch)
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
      heatmap_data.dart            # HeatmapTile (name, emoji, symbol, category, changePercent, perf1W–perf5Y), HeatmapData
    repositories/
      markets_repository.dart      # fetchIndices, fetchCommodities, fetchForex, fetchCotMetals
      trading_repository.dart      # fetchQuotes, fetchSignal, fetchHistory, fetchBacktest, fetchNews, searchStocks
      volatility_repository.dart   # fetchVolatilityAssets, fetchBriefing
      debt_repository.dart         # fetchDebt
      heatmap_repository.dart      # fetchHeatmap, fetchAssets(category) — client-side 15m/30m TTL
    sources/
      tariffs_data.dart            # Hardcoded 113-country tariff data (April 2025)

  features/
    splash/splash_screen.dart
    onboarding/onboarding_screen.dart
    markets/markets_screen.dart
    trading/
      trading_screen.dart
      tenx_backtest_screen.dart    # 10X scanner backtest viewer (/trading/10x-backtest?version=&type=)
    exposure/exposure_screen.dart
    volatility/volatility_screen.dart
    usa_debt/usa_debt_screen.dart
    country/country_detail_screen.dart
    country/country_stocks_screen.dart
    asset/asset_detail_screen.dart
    profile/profile_screen.dart    # Identity, subscription card, theme, chart provider, about

  providers/
    strategy_provider.dart         # TradingStrategy enum (s1/s2/s3) + StrategyNotifier — persisted
    alert_provider.dart            # Price alert state + 10s polling
    theme_provider.dart            # ThemeModeNotifier — persisted in SharedPreferences
    watchlist_provider.dart        # WatchlistNotifier — persisted list<String> of symbols
    chart_provider_provider.dart   # ChartProviderNotifier (yahoo | tradingview) — persisted; switching triggers RestartWidget

  services/
    entitlement_service.dart       # EntitlementService — Plan enum (free/pro/insight/enterprise), feature gates, RC integration

  shared/widgets/
    chart_modal.dart               # Candlestick bottom sheet (Lightweight Charts v4 via WebView)
    max_width_layout.dart          # Centers + caps content at 720px for tablet/landscape
    error_view.dart                # Generic error + retry widget
    freshness_bar.dart             # FreshnessBar(lastUpdated) — "X ago" banner bar
    glass_card.dart                # Frosted-glass card container
    performance_heatmap.dart       # PerformanceHeatmap(tiles) — color-coded grid, timeframe selector (1D–5Y)
    settings_sheet.dart            # SettingsSheet — chart provider switcher (requires restart confirmation)
    signal_badge.dart              # BUY/HOLD/SELL colored chip
    sparkline_chart.dart           # Mini fl_chart sparkline
    theme_toggle.dart              # ThemeToggleButton — pill with sun/moon icons
    tv_advanced_chart_widget.dart  # TvAdvancedChartWidget(tvSymbol, isDark) — inline TradingView Advanced Charts via WebView
    upgrade_sheet.dart             # UpgradeSheet(feature) — RevenueCat paywall sheet

  utils/
    tv_symbol.dart                 # Yahoo → TradingView symbol map + TvSymbol.open(symbol)
```

### Routes

```
/splash                    → SplashScreen        (restores lastTab from SharedPreferences)
/onboarding                → OnboardingScreen
/markets                   → MarketsScreen
/trading                   → TradingScreen
/exposure                  → ExposureScreen
/volatility                → VolatilityScreen
/debt                      → UsaDebtScreen
/profile                   → ProfileScreen
/country/:code             → CountryDetailScreen
/country/:code/stocks      → CountryStocksScreen (pass ?name=... query param)
/asset/:symbol             → AssetDetailScreen   (pass ?name=... query param)
/trading/10x-backtest      → TenXBacktestScreen  (pass ?version=v1|v2 and ?type=assets|stocks)
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

**Profile** (`/profile`): shows identity header (account coming soon), subscription card (RevenueCat), theme section (`_ThemeSection` — dark/light toggle lives here, NOT in AppBar), chart provider section, about. No `ThemeToggleButton` in its AppBar.

**10X Backtest** (`/trading/10x-backtest`): scanner backtest viewer with v1/v2 selector, type toggle (assets/stocks), signal filter chips, sortable table.

---

## State Management

- **Server state**: `FutureProvider.autoDispose[.family]` — no polling except trading quotes (30s timer in Trading screen)
- **Strategy**: `NotifierProvider<StrategyNotifier, TradingStrategy>` — persisted in SharedPreferences
  - `strategy.label` → `"S1"/"S2"/"S3"` — UI display only, **never pass to API**
  - `strategy.serverParam` → `"1"/"2"/"3"` — always use this for API calls
- **Theme**: `NotifierProvider<ThemeModeNotifier, ThemeMode>` — persisted in SharedPreferences
- **Alerts**: `alertProvider` — price alerts with 10s polling timer when alerts exist
- **Watchlist**: `watchlistProvider` (WatchlistNotifier) — persisted list of symbol strings
- **Chart provider**: `chartProviderProvider` (ChartProviderNotifier) — `yahoo | tradingview`, switching triggers `RestartWidget.restartApp(context)`

---

## Monetization / Entitlement System

`EntitlementService` (`services/entitlement_service.dart`) is the single source of truth for plan gating in the Flutter app.

```dart
// Check access
if (!EntitlementService.can('signals_advanced')) {
  UpgradeSheet.show(context, feature: 'signals_advanced');
  return;
}
```

**Plan enum**: `Plan.free | Plan.pro | Plan.insight | Plan.enterprise`

**Feature gate keys** (pass to `EntitlementService.can()`):

| Key | Required plan |
|-----|--------------|
| `signals_advanced` | Pro+ |
| `analyst_notes_unlimited` | Pro+ |
| `alerts_unlimited` | Pro+ |
| `push_notifications` | Pro+ |
| `exposure_ai` | Insight+ |
| `api_access` | Insight+ |
| `best_setups` | Pro+ |
| `backtest_filter` | Insight+ |

**Dev bypass**: pass `--dart-define=DEV_PLAN=insight` to skip all plan gates.

**UpgradeSheet**: `UpgradeSheet.show(context, feature: 'xxx')` — presents paywall via RevenueCat `Purchases.getOfferings()`.

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
- Profile → theme toggle is inside `_ThemeSection` in the body — **no ThemeToggleButton in AppBar**
- Bottom nav (`app.dart`) → no toggle, only the 6 nav tabs
- **Always add `ThemeToggleButton` to AppBar actions on any new screen** (exception: Profile).

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

`TvAdvancedChartWidget(tvSymbol, isDark)` — inline TradingView Advanced Charts embedded via WebView (used in Asset Detail chart tab). **Does not** use `fetch()` — loads TradingView's CDN widget script directly.

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
| Nav tab count | 5 tabs | 6 tabs (Markets/Trading/Exposure/Volatility/Debt/Profile) |
| Plan gate in dev mode | gates fire when APP_SIGNING_SECRET absent | dev mode = enterprise — all features unlocked; use DEV_PLAN dart-define to simulate a plan |
| Calling plan-gated API without X-Device-ID | endpoint returns 403 | Dio SigningInterceptor adds X-Device-ID + X-Signature automatically |
