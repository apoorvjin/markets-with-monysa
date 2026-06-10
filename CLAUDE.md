# Moby — Claude Code Index

> **What is this file?**
> `CLAUDE.md` is loaded automatically by Claude Code at the start of every session. It is written *for the AI assistant*, not for human developers. It front-loads non-obvious facts — naming conventions that look wrong but are intentional, API field names that differ from what you'd expect, architectural invariants that span multiple files, and constraints that exist for reasons not visible in the code.
>
> **Differs from `README.md`**: README explains what the project is and how to run it. This file explains what Claude must *know* to avoid silently breaking things.

---

## Project Overview

**Moby** is a Flutter mobile app (iOS / Android) backed by a TypeScript Express API. One active frontend, one backend.

Five user-facing capabilities:
- **Live Markets** — 46 global indices, 23 commodities, 44 forex pairs with candlestick charts, plus a market-cap-weighted treemap heatmap (9 indices: S&P 500 / NASDAQ 100 / Dow Jones / Russell 2000 / FTSE 100 / DAX 40 / Nikkei 225 / Hang Seng / Nifty 50)
- **AI Trading Signals** — BUY / HOLD / SELL with entry, SL, TP, and reasoning for 49+ assets across three strategies (S1 / S2 / S3)
- **Investing** — Best Setups, Multibaggers, Congress/House trades, Presidential (OGE), Smart Money
- **Tariff Exposure** — US tariff impact ranked across 113+ countries with sector breakdown (browsable country list, not AI gated)
- **Macro** — Market Stress Meter, VIX, Fear & Greed, yield curve, sector rotation (RRG), correlation matrix, crisis playbook, AI briefing, US Debt

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
    economy.ts          # search, usa-debt, country-data, bonds, sectors (with rsRatio/rsMomentum), crises, tariffs,
                       #   yield-curve-history (/api/economy/yield-curve-history), economy events (/api/economy/events)
    exposure.ts         # GET /api/exposure/analysis (Anthropic, plan-gated: Insight+)
    heatmap.ts          # GET /api/heatmap, GET /api/heatmap/assets, GET /api/heatmap/treemap (Pro)
                       #   Supports 9 indices; FX-normalises non-USD caps to USD for tile sizing
    markets.ts          # stocks, futures, chart, central-bank-rates
    oge.ts              # GET /api/oge/trump-transactions (OGE Form 278-T PDF pipeline; two-layer Redis+memory cache)
    quiver.ts           # /api/quiver/* + GET /api/house-trades (FMP House PTR trades)
    shared.ts           # Shared utilities
    volatility.ts       # GET /api/volatility/assets, POST /api/volatility/briefing,
                       #   GET /api/volatility/fear-greed

  data/                 # Static data tables bundled with the server
    index_constituents.ts  # Hardcoded symbol lists for DJI 30 / NASDAQ 100 / FTSE 100 / Nifty 50 /
                           # Russell 2000 / DAX 40 / Nikkei 225 / Hang Seng (used by /api/heatmap/treemap).
                           # S&P 500 constituents fetched live from public CSV.

  lib/                  # Shared server utilities
    chart-renderer.ts   # Per-device chart-provider preference middleware
    leader.ts           # Multi-machine leader election via Upstash Redis lease.
                       # Gates BacktestWarm + Finnhub WS to one machine when Fly runs >1.
                       # isLeader() returns true without Redis (local dev / single-machine).

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

### Caching Architecture

Three coordinated caching layers:

1. **In-process Map caches** (per route) — every endpoint stores `{ data, ts }` per cache key with per-route TTLs. Survives the lifetime of one machine.
2. **`Cache-Control` headers** on every route — emitted with `max-age` ≈ half the in-process TTL and `stale-while-revalidate` ≈ the full TTL. Lets a CDN/edge cache absorb concurrent device traffic. The Flutter Dio client doesn't honour these directly; ETag/304 negotiation handles the client side.
3. **Server ETag → client `If-None-Match`** — Express auto-generates weak ETags on `res.json()`. The Flutter `ETagInterceptor` ([etag_interceptor.dart](moby/lib/core/network/etag_interceptor.dart)) caches body+ETag in memory and substitutes the cached body on 304, so large stable payloads (tariffs ~50 KB, treemap ~200 KB) skip a fresh download.

**Leader election** ([leader.ts](server/lib/leader.ts)): when Fly runs >1 machine, `BacktestWarm` and the Finnhub WS connection are leader-only. Uses an Upstash Redis lease (`leader:lease`, 90s TTL, 30s refresh). Without Redis configured, every process is leader (safe for single-machine / local dev).

**`/api/trading/quotes`** is the odd one out: it serves from the `latestPrices` Map populated by a 20s background poll loop, not from a request-time cache. Do **not** add the standard cache pattern (or Redis L2) on this endpoint — the poll already is the cache. See [US-017](USER_STORIES.md) for the pattern applied elsewhere.

**`/api/trading/best-setups-sector` skeleton-first pattern**: heavy computation (~5 min cold) is fronted by a fast `cacheWarm: false` skeleton response when the cache is cold. The handler kicks off the compute via `ensureBestSetupsSectorFresh` (in-flight coalesced per version) and returns instantly. The client auto-polls every 30s (capped at 10 polls) until `cacheWarm: true`. Pre-warm runs at boot+3 min on the leader. See `/api/trading/scanner/best-setups` for the original skeleton pattern.

**Disk persistence (Flutter)** via [disk_cache.dart](moby/lib/core/cache/disk_cache.dart) — `SharedPreferences`-backed JSON cache used by `TariffsData`, `HeatmapRepository.fetchTreemap`, `TradingRepository._fetchAndCacheScanner`, and `TradingRepository.fetchSectorBestSetups`. Pattern: hydrate from disk on cold start → fetch network → write disk on success → fall back to `readStale` on network error. Repositories that don't use disk persistence still keep in-memory caches keyed by their TTLs.

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
| `GET /api/trading/scanner/10x/stocks` | 10X scanner v1 — auto-discovered global equities | varies |
| `GET /api/trading/scanner/10x/india` | 10X scanner v1 — India equities | varies |
| `GET /api/trading/scanner/10x/uk` | 10X scanner v1 — UK equities | varies |
| `GET /api/trading/scanner/10x/japan` | 10X scanner v1 — Japan equities | varies |
| `GET /api/trading/scanner/10x/hongkong` | 10X scanner v1 — HK equities | varies |
| `GET /api/trading/scanner/10x/china` | 10X scanner v1 — China equities | varies |
| `GET /api/trading/scanner/10x/euronext` | 10X scanner v1 — Euronext equities | varies |
| `GET /api/trading/scanner/10x-v2/assets` | 10X scanner v2 — Pine Script aligned assets | varies |
| `GET /api/trading/scanner/10x-v2/stocks` | 10X scanner v2 — global equities | varies |
| `GET /api/trading/scanner/10x-v2/india` | 10X scanner v2 — India equities | varies |
| `GET /api/trading/scanner/10x-v2/uk` | 10X scanner v2 — UK equities | varies |
| `GET /api/trading/scanner/10x-v2/japan` | 10X scanner v2 — Japan equities | varies |
| `GET /api/trading/scanner/10x-v2/hongkong` | 10X scanner v2 — HK equities | varies |
| `GET /api/trading/scanner/10x-v2/china` | 10X scanner v2 — China equities | varies |
| `GET /api/trading/scanner/10x-v2/euronext` | 10X scanner v2 — Euronext equities | varies |
| `GET /api/trading/scanner/10x-v3/assets` | 10X scanner v3 — "Super Pine" index regime breakout (Indices only; 5 signals: thrust/base/uptrend/newHighReclaim/regimeBreakout) | 30m |
| `GET /api/trading/scanner/10x/single` | Single-symbol 10X score (?symbol=) | varies |
| `GET /api/trading/scanner/backtest/:type` | Historical signal backtest (v1/v2 via ?version=) | 24h |
| `GET /api/trading/scanner/best-setups` | Best setups filter (?version=&type=&minWinRate=) | varies |
| `GET /api/trading/best-setups-sector` | Sector-grouped best setups (?version=) → { leading, improving, cacheWarm, lastUpdated }. **Cold cache returns `cacheWarm:false` skeleton in <5 ms** and kicks off background compute — client must poll, not block. | 30m warm; skeleton when cold |
| `GET /api/trading/regime-summary` | Market regime summary (trend, breadth, volatility signals) | varies |
| `GET /api/trading/earnings-calendar` | Upcoming earnings (?days=15) | varies |
| `GET /api/trading/correlation` | Asset correlation matrix | varies |
| `GET /api/trading/copy-trades` | Congress member copy-trade portfolio (?memberName=) | varies |
| `GET /api/volatility/assets` | Crisis assets + sparklines | 10m |
| `POST /api/volatility/briefing` | GPT-4o-mini macro stress analysis | 30m |
| `GET /api/volatility/fear-greed` | CNN Fear & Greed index | varies |
| `GET /api/usa-debt` | Live US debt from Treasury API | 12h |
| `GET /api/bonds` | US Treasury yield curve (3m/5y/10y/30y + spread + status) | 30m |
| `GET /api/sectors` | 11 sector ETF performance (1W/1M change %) | 15m |
| `GET /api/search?q=QUERY` | Yahoo Finance symbol/name search | none |
| `GET /api/country-data/:code` | World Bank GDP, trade, military data | 24h |
| `GET /api/crises` | Historical crisis playbook data (static) | — |
| `GET /api/tariffs` | 113-country US tariff table (USTR April 2025 snapshot) | 24h |
| `GET /api/economy/yield-curve-history` | 1Y daily OHLCV for 3m/5y/10y/30y yields → { series: [{date,us3m,us5y,us10y,us30y}], lastUpdated } | 6h |
| `GET /api/economy/events` | High-impact USD economic events (FF Calendar + FOMC static fallback) → { events, lastUpdated } | 12h |
| `GET /api/heatmap` | Performance heatmap (sectors/regions) | 15m |
| `GET /api/heatmap/assets` | Heatmap per-category assets (?category=) | 30m |
| `GET /api/heatmap/treemap` | Market-cap-weighted treemap for an index. `?index=sp500\|ndx\|dji\|russell2000\|ftse100\|dax40\|nikkei225\|hsi\|nifty50`, `&limit=N` (UI sends 500), `&timeframe=1d\|1w\|1m\|ytd`. FX-normalised to USD. Plan-gated: Pro+. | constituents 24h + quotes 5m |
| `GET /api/exposure/analysis` | AI tariff exposure analysis (Insight+ plan) | 24h |
| `POST /api/billing/webhook` | RevenueCat subscription event webhook | — |
| `GET /api/quiver/congress` | Top-10 congress buys by disclosed amount (FMP → Quiver → snapshot) | 4h |
| `GET /api/quiver/lobbying` | Top-10 by QoQ lobbying spend growth (Senate LDA) | 4h |
| `GET /api/quiver/insider` | Top-10 by insider buy count — 90-day window (SEC EDGAR) | 4h |
| `GET /api/quiver/congress-trades` | Raw congress trades last 365 days (?ticker=&chamber=&type=) (FMP) | 4h |
| `GET /api/house-trades` | House PTR trades — all history via FMP (requires FMP_API_KEY) | 4h |
| `GET /api/oge/trump-transactions` | Presidential transactions ≥ $100K from OGE Form 278-T PDFs | 24h |
| `POST /api/oge/trump-transactions/refresh` | Force-bust OGE cache + re-run PDF pipeline | — |

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
GET /api/sectors              → { sectors: [{ emoji, name, changePercent, perf1W, perf1M, perf3M, perf6M, perf1Y, perf3Y, perf5Y, rsRatio, rsMomentum }], lastUpdated }
                                  rsRatio/rsMomentum are SPX-relative Relative Rotation Graph values (centred at 100)
GET /api/crises               → { crises: [...], dataAsOf: CRISIS_DATA_REVIEWED_AT (e.g. "June 2026"), lastUpdated: ISO }
GET /api/tariffs              → { countries: [CountryTariff], dataAsOf: "April 2025", lastUpdated: "2025-04-09T00:00:00.000Z", source: string }
                                  CountryTariff: { countryName, countryCode, tariffRate, sectors: [SectorTariff], debtToUSA: [DebtDetail], laymanExplanation, lastUpdated }
                                  SectorTariff: { sectorName, tariffRate, sourceURL }
                                  DebtDetail: { category, amountBillions, notes }
                                  Data file: server/data/tariffs.json — update and bump TARIFFS_DATA_AS_OF in economy.ts to refresh without an app release
GET /api/heatmap              → { tiles: [...], lastUpdated }
GET /api/heatmap/assets       → { tiles: [...], category, lastUpdated }
GET /api/heatmap/treemap      → { index, timeframe, limit, total, stocks: [TreemapStock], lastUpdated, marketState? }
                                  TreemapStock: { symbol, name, sector, marketCap, changePercent, price,
                                                  dayHigh?, dayLow?, fiftyTwoWeekHigh?, fiftyTwoWeekLow?,
                                                  sparkline?, preMarketPrice?, preMarketChangePercent?,
                                                  postMarketPrice?, postMarketChangePercent?,
                                                  nativeCurrency, marketCapUsd?, fxRateUsed? }
                                  total = resolved-from-Yahoo count (≤ constituent count).
                                  marketCap is native-currency; marketCapUsd is FX-normalised USD (null when FX fetch failed).
                                  effectiveMarketCap = marketCapUsd ?? marketCap — use this for tile sizing.
                                  marketState: "REGULAR"|"PRE"|"POST"|"POSTPOST" — from lead stock in index.
GET /api/exposure/analysis    → { comps: [{ name, ticker, revenueExposurePct, earningsImpactPct }], summary }
GET /api/quiver/congress      → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
GET /api/quiver/lobbying      → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
GET /api/quiver/insider       → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
                                  QuiverItem: { symbol, name, price, changePercent, weight, rank, badge, badgeLabel }
GET /api/quiver/congress-trades → { trades: [CongressTrade], total, lastUpdated }
                                  Supports ?memberName= filter to get a single member's trades.
                                  CongressTrade: { memberName, chamber, ticker, name?(company), assetDescription, type("buy"|"sell"),
                                                  transactionDate, filingDate, amount, amountMidpoint?, party?, state? }
GET /api/house-trades         → { trades: [HouseTrade], total, lastUpdated }
                                  HouseTrade fields mirror FMP response (disclosure_year, disclosure_date,
                                  transaction_date, owner, ticker, asset_description, type, amount,
                                  representative, district, state, ptr_link, cap_gains_over_200_usd)
GET /api/oge/trump-transactions → { transactions: [OgeTransaction], total, lastUpdated, loading? }
                                  OgeTransaction: { description, type("purchase"|"sale"|"exchange"),
                                                    date(YYYY-MM-DD), amount("$X - $Y"),
                                                    amountMidpoint, filingDate, source(PDF filename) }
                                  loading=true when the server PDF pipeline is still running.
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
FMP_API_KEY                        optional — Financial Modeling Prep free-tier key for congress trading data
                                              (Senate + House last 365 days). Free signup: financialmodelingprep.com
                                              Used by /api/quiver/congress and /api/quiver/congress-trades.
                                              Falls back to QUIVER_API_KEY, then snapshot, when absent.
QUIVER_API_KEY                     optional — Quiver Quantitative paid-tier key for congress trading data.
                                              Secondary fallback after FMP_API_KEY for /api/quiver/congress.
UPSTASH_REDIS_REST_URL             optional — Upstash Redis REST URL for OGE PDF pipeline distributed lock + cache.
                                              Without it: single-machine in-memory cache only (fine for local dev).
UPSTASH_REDIS_REST_TOKEN           optional — Upstash Redis REST token (pair with UPSTASH_REDIS_REST_URL).
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
  app.dart                         # MaterialApp.router (title: 'Monysa') + AppShell (bottom nav, 5 tabs)

  core/
    cache/
      disk_cache.dart              # DiskCache — SharedPreferences-backed JSON cache with TTL. read() honours TTL;
                                   # readStale() ignores TTL (for offline fallback). Used by TariffsData, HeatmapRepository
                                   # (treemap), TradingRepository (scanner + sector best-setups).
    network/
      api_client.dart              # Singleton Dio (15s connect, 30s receive, LogInterceptor + SigningInterceptor + ETagInterceptor)
      api_endpoints.dart           # All URL builders — baseUrl from dart-define or fly.dev default
      device_id.dart               # DeviceId — generates + persists UUID; sent as X-Device-ID header
      etag_interceptor.dart        # ETagInterceptor — captures ETag on success, sends If-None-Match on subsequent GETs,
                                   # substitutes cached body on 304. In-memory only, capped at 64 entries.
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
      treemap_stock.dart           # TreemapStock (symbol, name, sector, marketCap, changePercent, price,
                                   # dayHigh/Low, 52wHigh/Low, sparkline, pre/post market fields,
                                   # nativeCurrency, marketCapUsd, fxRateUsed, effectiveMarketCap getter),
                                   # TreemapHeatmapData (index, timeframe, limit, total, stocks, lastUpdated, marketState)
      house_trade.dart             # HouseTradeRecord, EnrichedHouseTrade, HouseTradesOverview, TopTrader, TopTicker,
                                   # HouseTradesResult, HouseTradeFilter + filterTrades/buildOverview/buildTopTraders helpers
    repositories/
      markets_repository.dart      # fetchIndices, fetchCommodities, fetchForex, fetchCotMetals
      trading_repository.dart      # fetchQuotes, fetchSignal, fetchHistory, fetchBacktest, fetchNews, searchStocks
      volatility_repository.dart   # fetchVolatilityAssets, fetchBriefing
      debt_repository.dart         # fetchDebt
      heatmap_repository.dart      # fetchHeatmap, fetchAssets(category), fetchTreemap(index, limit) — client-side 15m/30m/5m TTLs
      house_trades_repository.dart # fetchHouseTrades — fetches /api/house-trades, returns HouseTradesResult
    sources/
      tariffs_data.dart            # TariffsData singleton — fetches /api/tariffs, hydrates from DiskCache on cold start,
                                   # 24h in-memory TTL refresh. `lastUpdated` / `dataAsOf` populated after first load().

  features/
    splash/splash_screen.dart
    onboarding/onboarding_screen.dart
    markets/markets_screen.dart
    markets/treemap_tab.dart          # First sub-tab of Markets — Pro+ market-cap treemap, 9-index chips
                                      # (S&P 500/NASDAQ 100/Dow Jones/Russell 2000/FTSE 100/DAX 40/Nikkei 225/HSI/Nifty 50)
                                      # + timeframe chips (1D/1W/1M/YTD). Tile size = effectiveMarketCap (USD-normalised).
    trading/
      trading_screen.dart
      tenx_backtest_screen.dart    # 10X scanner backtest viewer (/trading/10x-backtest?version=&type=)
    investing/
      investing_screen.dart        # 7 sub-tabs: Exposure / Dashboard / Multibaggers / Presidential / Congress / Smart $ / House Trades
      multibaggers_screen.dart     # Multibaggers screen (/trading/multibaggers?country=us); default country=US; country-aware stock search
      house_trades_tab.dart        # HouseTradesTab — uses HouseTradesRepository + house_trade.dart models
    exposure/exposure_screen.dart  # ExposureScreen — embedded as "Exposure" tab inside InvestingScreen
    volatility/volatility_screen.dart  # MacroScreen (class name!) — /macro route; also still has old VolatilityScreen import path
    usa_debt/usa_debt_screen.dart  # UsaDebtScreen — embedded inside MacroScreen tabs
    country/country_detail_screen.dart
    country/country_stocks_screen.dart
    asset/asset_detail_screen.dart
    profile/profile_screen.dart    # Identity, subscription card, theme, font size, chart provider, about

  providers/
    strategy_provider.dart         # TradingStrategy enum (s1/s2/s3) + StrategyNotifier — persisted
    alert_provider.dart            # Price alert state + 10s polling
    theme_provider.dart            # ThemeModeNotifier — persisted in SharedPreferences
    watchlist_provider.dart        # WatchlistNotifier — persisted list<String> of symbols
    chart_provider_provider.dart   # ChartProviderNotifier (yahoo | tradingview) — persisted; switching triggers RestartWidget
    font_size_provider.dart        # FontSizeScaleNotifier (regular=0.9x | enlarged=1.0x) — persisted; applied as
                                   # textScaler in app.dart; default is 'regular' (0.9x scale)

  services/
    entitlement_service.dart       # EntitlementService — Plan enum (free/pro/insight/enterprise), feature gates, RC integration

  shared/widgets/
    chart_modal.dart               # Candlestick bottom sheet (Lightweight Charts v4 via WebView)
    max_width_layout.dart          # Centers + caps content at 720px for tablet/landscape
    error_view.dart                # Generic error + retry widget
    freshness_bar.dart             # FreshnessBar(lastUpdated) — "X ago" banner bar
    glass_card.dart                # Frosted-glass card container
    performance_heatmap.dart       # PerformanceHeatmap(tiles) — color-coded grid, timeframe selector (1D–5Y)
    sector_treemap.dart            # SectorTreemap — two-level squarified treemap (Bruls/Huijz/van Wijk),
                                   # sector grouping, background-coloured boundary outlines, tap → tooltip card
    settings_sheet.dart            # SettingsSheet — chart provider switcher (requires restart confirmation)
    shimmer_list.dart              # ShimmerList — loading skeleton for list screens
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
/splash                    → SplashScreen         (restores lastTab from SharedPreferences)
/onboarding                → OnboardingScreen
/markets                   → MarketsScreen
/trading                   → TradingScreen
/investing                 → InvestingScreen       (7 sub-tabs; replaces standalone Exposure screen)
/macro                     → MacroScreen           (in volatility_screen.dart; replaces /volatility + /debt)
/profile                   → ProfileScreen
/country/:code             → CountryDetailScreen
/country/:code/stocks      → CountryStocksScreen  (pass ?name=... query param)
/asset/:symbol             → AssetDetailScreen    (pass ?name=... query param)
/trading/10x-backtest      → TenXBacktestScreen   (pass ?version=v1|v2 and ?type=assets|stocks)
/trading/multibaggers      → MultibaggersScreen   (pass ?country=us|india|uk|japan|… default: us)

REDIRECTS (app_router.dart handles these automatically):
/exposure   → /investing
/volatility → /macro
/debt       → /macro
```

### Screen Notes

**Markets** (`/markets`): 5 sub-tabs — **Heatmap** (default) / Indices / Commodities / Forex / CFTC. Each price tab has inline search; forex is grouped by region when not searching, flat list when searching; CFTC metals section hides during search; tap any row → `ChartModal` bottom sheet. The Heatmap tab is a market-cap-weighted treemap with index-selector chips (S&P 500 / NASDAQ 100 / Dow Jones / Russell 2000 / FTSE 100 / DAX 40 / Nikkei 225 / Hang Seng / Nifty 50) and timeframe chips (1D / 1W / 1M / YTD). Tile size = USD-normalised market cap (`effectiveMarketCap`), tile colour = % change for selected timeframe. Tap a tile → centred tooltip card. Plan-gated: Pro+ (`treemap_heatmap`).

**Trading** (`/trading`): four sub-tabs — Dashboard / AI Signals / Alerts / Power Moves.
- Dashboard category chips (in order): ★ Watchlist / Commodities / Indices / Stocks / Forex / Crypto / All. "Stocks" chip switches to full-text search (debounced 400ms, calls `/api/search`). Other chips show 49 live asset rows with 30s auto-refresh.
- AI Signals: strategy selector row has `Icons.info_outline_rounded` (size 18) at right → opens `showModalBottomSheet` explaining S1/S2/S3.
- Alerts: badge count on tab icon when alerts are active.

**Investing** (`/investing`): 7 scrollable sub-tabs — **Exposure** (default) / Dashboard / Multibaggers / Presidential / Congress / Smart $ / House Trades.
- Exposure: embeds `ExposureBody` from `exposure_screen.dart` — shows browsable/searchable/sortable list of 113+ countries with their US tariff rates (from `/api/tariffs`). Sort options: Market Size (GDP proxy, default) / Rate / Name. **Free, no plan gate.** This is tab index 0 — the default landing tab. (The AI analysis endpoint `/api/exposure/analysis` still exists on the server, plan-gated Insight+, but the Flutter tab no longer calls it.)
- Dashboard: Best Setups (plan-gated: Pro+).
- Multibaggers: full-screen push to `/trading/multibaggers?country=us` (default US). Country chips: 🇺🇸 US / 🇮🇳 India / 🇬🇧 UK / 🇯🇵 Japan / 🇭🇰 HK / 🇨🇳 China / 🇪🇺 Euronext. Has country-aware stock search (search bar filters results by country via Yahoo Finance symbol suffix + exchange code).
- Presidential: OGE Form 278-T transactions ≥ $100K — fetches `/api/oge/trump-transactions`. **Presidential is before Congress.**
- Congress: QuiverItem congress top-10 buys.
- Smart $: QuiverItem insider + lobbying.
- House Trades: House PTR trades from FMP — uses `HouseTradesRepository` + `house_trade.dart` models.

**Trading** (`/trading`) Power Moves tab: 4th tab. Scanner for Indices/Forex/Commodities/Crypto assets with v1/v2/v3 Pine variants. Auto-selects correct v3 version when type changes (Indices→v3, Forex→v3f, Crypto→v3crypto). Backtest link (v1/v2 only) uses `/trading/10x-backtest?version=&type=assets`. Info sheet explains each version's signals.

**Macro** (`/macro`, class `MacroScreen` in `volatility_screen.dart`): **5 sub-tabs** — Dashboard / Crisis / Debt / Calendar / **Correlation**.
- Dashboard: Market Stress Meter, Fear & Greed gauge, VIX gauge, crisis assets sparklines, yield curve section with info icon (Normal/Flat/Inverted), sector rotation RRG quadrant panel, geopolitical infographic, AI briefing button.
- Crisis: Historical crisis playbook (CRISIS_DATA array).
- Debt: UsaDebtScreen — live US debt clock.
- Calendar: Dynamic economic events from `/api/economy/events` (FF Calendar + static FOMC fallback).
- Correlation: `CorrelationTab` — asset correlation matrix from `/api/trading/correlation`.

**Country Stocks** (`/country/:code/stocks`): India has NSE / BSE exchange tabs. Tap any row → `/asset/:symbol` (full 5-tab detail), not a chart modal.

**Asset Detail** (`/asset/:symbol`): 5 sub-tabs — Chart / Signal / Indicators / Backtest / News. Chart tab is an inline `WebViewController` (not a modal); a fullscreen icon opens `ChartModal` on top. AppBar has TradingView icon + timeframe selector.

**Profile** (`/profile`): shows identity header (account coming soon), subscription card (RevenueCat), theme section (`_ThemeSection` — dark/light toggle lives here, NOT in AppBar), font size section (Regular/Enlarged), chart provider section, about. No `ThemeToggleButton` in its AppBar.

**10X Backtest** (`/trading/10x-backtest`): scanner backtest viewer with v1/v2 selector, type toggle (assets/stocks), signal filter chips, sortable table.

**Multibaggers** (`/trading/multibaggers`): country-specific multibagger stock screen. Pass `?country=us` (default). Pushed from Investing → Multibaggers tab. Three-mode build: normal list → search suggestions → single-stock scan. Country filter chips on own row above scrollable chip row (prevents overflow with 7 chips). Country-aware search uses Yahoo Finance suffix/exchange codes to filter results per country.

---

## State Management

- **Server state**: `FutureProvider.autoDispose[.family]` — no polling except trading quotes (30s timer in Trading screen)
- **Strategy**: `NotifierProvider<StrategyNotifier, TradingStrategy>` — persisted in SharedPreferences
  - `strategy.label` → `"S1"/"S2"/"S3"` — UI display only, **never pass to API**
  - `strategy.serverParam` → `"1"/"2"/"3"` — always use this for API calls
- **Theme**: `NotifierProvider<ThemeModeNotifier, ThemeMode>` — persisted in SharedPreferences
- **Font size**: `fontSizeScaleProvider` (FontSizeScaleNotifier) — `regular=0.9x | enlarged=1.0x`, persisted; applied globally via `textScaler` in `app.dart`
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
| `exposure_ai` | Insight+ (guards `/api/exposure/analysis` — AI analysis endpoint; the Flutter Exposure tab now calls `/api/tariffs` instead and is free) |
| `api_access` | Insight+ |
| `best_setups` | Pro+ |
| `backtest_filter` | Insight+ |
| `treemap_heatmap` | Pro+ |

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
- Markets, Trading, Investing, Macro → `AppBar(actions: [ThemeToggleButton()])`
- Profile → theme toggle is inside `_ThemeSection` in the body — **no ThemeToggleButton in AppBar**
- Bottom nav (`app.dart`) → no toggle, only the 5 nav tabs
- **Always add `ThemeToggleButton` to AppBar actions on any new screen** (exception: Profile).

---

## Tablet / Landscape Layout

`MaxWidthLayout` centers content and caps it at 720px. Currently applied to: Trading, Investing, Macro. Markets and detail screens are full-width. Wrap any new single-column screen in `MaxWidthLayout`.

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
| Nav tab count | 6 tabs | 5 tabs (Market/Trading/Investing/Macro/Profile) |
| Old routes still used | `/exposure`, `/volatility`, `/debt` as primary | These redirect → `/investing` and `/macro`; never add new screens at those paths |
| Crisis `dataAsOf` hardcoded | `"May 2026"` string literal | Constant `CRISIS_DATA_REVIEWED_AT` in `economy.ts` — update the constant (not a raw string) when CRISIS_DATA changes |
| Tariff data bundled in Flutter | `rootBundle.loadString('assets/data/tariffs.json')` | Tariff data now served from `GET /api/tariffs`; update `server/data/tariffs.json` and bump `TARIFFS_DATA_AS_OF` in `economy.ts` to refresh without an app release |
| `TariffsData.instance.load()` loads assets | Old approach used `dart:convert` + `rootBundle` | Now calls `ApiClient.instance.get(ApiEndpoints.tariffs)` — `TariffsData.instance.lastUpdated` and `.dataAsOf` are populated after the first `load()` call |
| MacroScreen class location | `volatility_screen.dart` sounds wrong | Correct — `MacroScreen` lives in `features/volatility/volatility_screen.dart`. Has 5 tabs: Dashboard/Crisis/Debt/Calendar/Correlation. |
| OGE response shape | `OgeTransaction[]` array directly | `{ transactions, total, lastUpdated, loading? }` — wrapped; `loading=true` while PDF pipeline runs |
| OGE transaction fields | `filer, position, ticker, exchange` | `description, type, date, amount, amountMidpoint, filingDate, source` |
| House trades response | raw array | `{ trades, total, lastUpdated }` — wrapped |
| Plan gate in dev mode | gates fire when APP_SIGNING_SECRET absent | dev mode = enterprise — all features unlocked; use DEV_PLAN dart-define to simulate a plan |
| Macro Calendar tab | Hardcoded FOMC/CPI/NFP/Jackson Hole dates | Dynamic: fetches `/api/economy/events` (FF Calendar feed); falls back to STATIC_EVENTS in server when feed is down |
| Treemap index count | 5 (S&P 500/NASDAQ 100/DJI/FTSE 100/Nifty 50) | 9 — also Russell 2000, DAX 40, Nikkei 225, Hang Seng |
| Calling plan-gated API without X-Device-ID | endpoint returns 403 | Dio SigningInterceptor adds X-Device-ID + X-Signature automatically |
| Investing default tab | Dashboard (index 1) | Exposure (index 0) — tab order is Exposure/Dashboard/Multibaggers/Presidential/Congress/Smart $/House Trades. Exposure is now free (tariff browser); Dashboard is Pro+. |
| Power Moves scanner location | InvestingScreen (10X tab) | Moved to TradingScreen as 4th tab "Power Moves" — _PowerMovesTab in trading_screen.dart |
| Stocks view in Power Moves | Stocks filter + search bar exist in scanner | Stocks view was removed — Power Moves is assets-only (Indices/Forex/Commodities/Crypto); Multibaggers handles country-specific stock scanning |
| Multibaggers default country | `?country=india` | `?country=us` — US is now the default and first chip |
| Markets sub-tabs | 4 (Indices/Commodities/Forex/CFTC) | 5 — **Heatmap** is now first and the landing sub-tab; the treemap is Pro-gated (`treemap_heatmap`) |
| Treemap tile sizing | `marketCap` (native currency) | Use `effectiveMarketCap` (= `marketCapUsd ?? marketCap`). All tiles are FX-normalised to USD when `marketCapUsd` is present — cross-index comparison is meaningful. |
| Adding a new screen inside AppShell | content extends behind glass bottom nav pill (clipped) | AppShell uses `extendBody: true` with a 58 px glass pill. **Always import `shared/widgets/app_shell_insets.dart`** — use `appShellBottomInset(context)` for any scroll/list bottom padding and `showAppBottomSheet()` instead of `showModalBottomSheet` for any modal (handles iOS notch + nav pill + drag-to-dismiss height in one call). Never hand-roll `MediaQuery.padding.bottom + nav heights` — it regressed three times before this helper existed |
| Yahoo `/v7/finance/quote` for batched US-equity marketCap | gated behind Unauthorized | Yahoo blocks v7 on cloud IPs. Use `/v10/finance/quoteSummary?modules=price,assetProfile` with crumb auth (fc.yahoo.com cookie → /v1/test/getcrumb) — `server/routes/heatmap.ts` already handles refresh + concurrency |
| `/api/trading/best-setups-sector` blocking 30–50 s on cold cache | calling and `await`-ing the response | Cold cache now returns `cacheWarm:false` skeleton in <5 ms while computing in the background (in-flight coalesced per version). Client must poll until `cacheWarm:true` — `_sectorBestSetupsProvider` in `investing_screen.dart` auto-re-fetches every 30 s, capped at 10 polls via `_sectorPollAttemptProvider`. Never `await` for warm data inside the handler. |
| `/api/trading/quotes` and the two-layer cache pattern | adding Redis L2 to mirror other hot routes | This route reads from `latestPrices` Map populated by the 20s background poll (`pollAllPrices`), not from a request-time cache lookup. The poll IS the cache. Do not add Redis L2 here — see US-017 for the routes that should use it. |
| BacktestWarm + Finnhub WS on multi-machine Fly | running on every machine | Both are gated to leader via `isLeader()` from `server/lib/leader.ts`. Followers skip with a `[BacktestWarm] skipping startup warm — follower` log. Leader election uses Upstash Redis lease; without Redis every process is leader (single-machine assumption). |
| Yahoo crumb 429 → 15-min hard backoff | flat 15-min backoff on first failure | Escalating backoff `[60s, 5m, 15m, 30m]` keyed off `_yfCrumbConsecutiveFails` in `server/trading.ts`. Resets to 0 on first success. A single transient 429 no longer wipes out quote freshness for 15 minutes. |
| Express behind Fly's proxy | leaving `trust proxy` unset (default) | `app.set("trust proxy", 1)` in `server/index.ts` — without it, `express-rate-limit` groups all users under Fly's proxy IP and emits `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` warnings. |
| Disk-persisted payloads survive a wrong schema | bumping a model shape without bumping `DiskCache._schemaVersion` | DiskCache prefixes keys with `dcache.v$_schemaVersion.`. Bump the version when changing the on-disk shape of *any* persisted payload (tariffs, treemap, scanner, best-sector). Old entries become unreachable and are overwritten on next write. |
| Server-side ETag for plan-gated endpoints | leaving the default `Cache-Control: public` | `private`-mark plan-gated endpoints (signals, analyst-note, exposure, treemap) so a CDN edge can't serve the response to other devices. Public for unauthenticated content (sectors, bonds, tariffs, etc.). |

---

## Working — Screen Reference

| Screen | Functionality | Backend APIs Invoked | Free / Pro / Insight |
|--------|--------------|---------------------|----------------------|
| **Markets** `/markets` | 5 sub-tabs: **Heatmap** (default; market-cap-weighted treemap of 9 indices with timeframe selector 1D/1W/1M/YTD, Pro+), Indices (46 global), Commodities (23), Forex (44 pairs grouped by region), CFTC metals (hedge fund COT positions). Inline search per price tab. Tap any row → candlestick chart modal; tap a treemap tile → tooltip card. | `/api/futures/indices` `/api/futures/commodities` `/api/futures/forex` `/api/futures/cot-metals` `/api/central-bank-rates` `/api/heatmap/treemap` | **Free**: Indices/Commodities/Forex/CFTC. **Pro** (`treemap_heatmap`): Heatmap tab. |
| **Trading** `/trading` | 4 sub-tabs: Dashboard (49 live assets, 30s refresh; category chips; Stocks chip = full-text search), AI Signals (S1–S3 strategy selector; BUY/HOLD/SELL per asset), Alerts (price alerts, 10s poll), Power Moves (scanner: Indices/Forex/Commodities/Crypto with v1/v2/v3 Pine variants). | `/api/trading/quotes` `/api/search` `/api/trading/signals/:symbol` `/api/trading/strategies` `/api/trading/scanner/10x-v3/assets` `/api/trading/scanner/10x-v3/commodities` `/api/trading/scanner/10x-v3/forex` `/api/trading/scanner/10x-v3/crypto` `/api/trading/scanner/10x/assets` `/api/trading/scanner/10x-v2/assets` | **Free**: S1–S3 signals, basic alerts, Power Moves. **Pro** (`signals_advanced`): S4–S8/advanced strategies. **Pro** (`alerts_unlimited`): more than 3 active alerts. |
| **Investing** `/investing` | 7 sub-tabs (Exposure is default): Exposure (tariff country browser — free), Dashboard (Best Setups — Pro+), Multibaggers, Presidential, Congress, Smart $, House Trades. | `/api/tariffs` `/api/trading/scanner/best-setups` `/api/trading/best-setups-sector` `/api/trading/scanner/10x-v2/assets` `/api/search` `/api/oge/trump-transactions` `/api/quiver/congress-trades` `/api/quiver/congress` `/api/quiver/lobbying` `/api/quiver/insider` `/api/house-trades` | **Free**: Exposure, Presidential, Congress, Smart $, House Trades, Multibaggers. **Pro** (`best_setups`): Dashboard tab (Best Setups). |
| **Macro** `/macro` | 5 sub-tabs: Dashboard (Market Stress Meter, Fear & Greed, VIX gauge, crisis assets sparklines, yield curve, sector rotation RRG, geopolitical infographic, AI macro briefing button), Crisis (historical crisis playbook), Debt (US live debt clock), Calendar (dynamic FOMC/CPI/NFP events from FF Calendar), Correlation (asset correlation matrix). | `/api/volatility/assets` `/api/volatility/fear-greed` `POST /api/volatility/briefing` `/api/bonds` `/api/sectors` `/api/heatmap` `/api/heatmap/assets` `/api/crises` `/api/usa-debt` `/api/economy/yield-curve-history` `/api/economy/events` `/api/trading/correlation` | **Free**: all content. **Pro** (`analyst_notes_unlimited`): AI Macro Briefing button (GPT-4o-mini stress analysis). |
| **Asset Detail** `/asset/:symbol` | 5 sub-tabs for any Yahoo Finance symbol: Chart (inline TradingView or Yahoo candlestick + fullscreen modal), Signal (AI BUY/HOLD/SELL with entry/SL/TP/reasoning), Indicators (fundamentals data), Backtest (walk-forward S1/S2/S3 results), News (headlines + sentiment). | `/api/chart/:symbol` `/api/trading/signals/:symbol` `/api/trading/backtest/:symbol` `/api/trading/news/:symbol` `/api/trading/analyst-note/:symbol` `/api/trading/fundamentals/:symbol` | **Free**: Chart, Signal, Backtest, News. **Pro** (`analyst_notes_unlimited`): Analyst Note inside Signal tab. |
| **Country Detail / Stocks** `/country/:code` `/country/:code/stocks` | Country overview (GDP, trade balance, military data from World Bank). Stocks list for that country; India has NSE/BSE exchange tabs. Tap stock row → Asset Detail (not a chart modal). | `/api/country-data/:code` `/api/stocks/:countryCode` | **All free.** |
| **Multibaggers** `/trading/multibaggers` | Full-screen country-specific 10X stock scanner. Country chips: 🇺🇸 US (default) / 🇮🇳 India / 🇬🇧 UK / 🇯🇵 Japan / 🇭🇰 HK / 🇨🇳 China / 🇪🇺 Euronext. v1/v2 version toggle. Min-signals filter. Country-aware stock search (type a name → suggestions filtered by selected country → tap → single-symbol scan). Three build modes: normal list / search suggestions / single-scan. | `/api/trading/scanner/10x/{country}` `/api/trading/scanner/10x-v2/{country}` `/api/trading/scanner/10x/single` `/api/search` | **All free.** |
| **10X Backtest** `/trading/10x-backtest` | Historical backtest viewer for 10X scanner signals. v1/v2 selector, type toggle (assets), signal filter chips, sortable win-rate/return table. | `/api/trading/scanner/backtest/:type?version=` | **Free** (basic). **Insight** (`backtest_filter`): advanced filter controls. |
| **Profile** `/profile` | Identity header, RevenueCat subscription card (upgrade/manage), theme toggle (dark/light), font size (Regular/Enlarged), chart provider (Yahoo/TradingView — restart required), about section. | None | **All free** (subscription card shows current plan; upgrading opens RevenueCat paywall). |
