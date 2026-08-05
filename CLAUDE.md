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
- **Investing** — Best Setups, Multibaggers, Presidential (OGE), Smart Money (lobbying + insider), ETF Explorer (holdings, sector weights, expense ratio, AUM, RRG rotation). Congress/House trade tracking was removed 2026-07 — see Known Pitfalls.
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
    auth.ts             # POST /api/auth/send-verification-email — sends FinBrio-branded verification email via
                       #   Resend (Firebase locks editing of its own verification template). Bearer = Firebase ID
                       #   token, verified via adminAuth().verifyIdToken(). Falls back to {sent:false,fallback:true}
                       #   when RESEND_API_KEY absent — client then uses Firebase's stock sendEmailVerification().
    billing.ts          # POST /api/billing/webhook (RevenueCat)
    economy.ts          # search, usa-debt, country-data, bonds, sectors (with rsRatio/rsMomentum), crises, tariffs,
                       #   yield-curve-history (/api/economy/yield-curve-history), economy events (/api/economy/events)
                       #   also exports getEtfRotationQuadrants() — generalized RRG math reused by etf.ts's rotation endpoint
    etf.ts              # GET /api/etf/list, GET /api/etf/:symbol/profile, GET /api/etf/rotation — free, no plan gate.
                       #   ETF universe defined in data/etf_universe.ts (42 ETFs, 7 categories)
    exposure.ts         # GET /api/exposure/analysis (Anthropic, plan-gated: Pro+)
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
    etf_universe.ts        # ETF_UNIVERSE: 42 curated ETFs across 7 categories (sector/broad/international/
                           # fixed_income/commodity/thematic/leveraged). Sector category imports SECTOR_ETFS
                           # from routes/economy.ts rather than duplicating it. ETF_ROTATION_CATEGORIES limits
                           # the RRG rotation view to equity-like categories (sector/broad/international/thematic).

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

**HMAC signing middleware**: When `APP_SIGNING_SECRET` is set, every API request must include an `X-Signature` header (`"<timestamp>.<hmac>"`). When the secret is absent (local dev), signing is bypassed and all devices are unrestricted (`pro` plan).

### Plan / Entitlement Enforcement

The app sells exactly **two tiers: Free and Pro**. There is no Insight or Enterprise tier — do not re-introduce them (both the Flutter `Plan` enum and the server `DevicePlan` type are two-value).

`plan-enforcement.ts` exports:
- `DevicePlan` type: `"free" | "pro"`
- `devicePlanMap: Map<string, DevicePlan>` — populated by RevenueCat webhook events
- `getDevicePlan(req)` — reads `X-Device-ID` header, returns plan (defaults to `"free"`)
- `isPro(plan)` — true for `pro`

The billing webhook (`entitlementsToPlan`) is **identifier-agnostic**: ANY active RevenueCat entitlement → `pro`. Do not match a specific entitlement id — a dashboard rename would otherwise silently drop paying users to Free. Mirrors `EntitlementService.updateFromCustomerInfo`.

In dev mode (`APP_SIGNING_SECRET` absent) every device returns `"pro"` — no gates fire.

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
| `GET /api/trading/earnings-calendar` | Upcoming earnings (?days=15&index=sp500\|ndx\|dji). Universe = live index constituents (S&P 500 fetched from the public CSV → no hardcoded ticker list); Nasdaq's keyless calendar (`api.nasdaq.com/api/calendar/earnings?date=`) supplies report dates, market cap, EPS estimate + pre/after-market timing. Alpha Vantage EARNINGS_CALENDAR is a fallback (no market cap). Yahoo's `calendarEvents` module is blocked on cloud IPs — never rely on it in prod. Empty results are NOT cached. | 6h |
| `GET /api/trading/correlation` | Asset correlation matrix | varies |
| `GET /api/trading/copy-trades` | Congress member copy-trade portfolio (?memberName=) | varies |
| `GET /api/volatility/assets` | Crisis assets + sparklines | 10m |
| `POST /api/volatility/briefing` | GPT-4o-mini macro stress analysis | 30m |
| `GET /api/volatility/fear-greed` | CNN Fear & Greed index | varies |
| `GET /api/usa-debt` | US debt clock — totalDebt/dailyIncrease/debtGrowth20yr live (Treasury); deficit/spending/interest live but fiscal-YTD, not annual (Treasury MTS); gdp/population live (World Bank); foreignHolders kept but dated (no live source — see Known Pitfalls); ssUnfunded/medicareUnfunded/debtPerTaxpayer removed (no live source, see Known Pitfalls) | 6h |
| `GET /api/bonds` | US Treasury yield curve (3m/5y/10y/30y + spread + status) | 30m |
| `GET /api/sectors` | 11 sector ETF performance (1W/1M change %) | 15m |
| `GET /api/search?q=QUERY` | Yahoo Finance symbol/name search | none |
| `GET /api/country-data/:code` | World Bank GDP, trade, military data | 24h |
| `GET /api/crises` | Historical crisis playbook data (static) | — |
| `GET /api/tariffs` | 113-country US tariff table. Static `tariffs.json` baseline (USTR April 2025) **merged with a live Federal Register overlay** (`routes/tariff-refresh.ts`) — recent per-country tariff actions extracted from presidential proclamations via Haiku. `dataAsOf`/`source` reflect the overlay when present; falls back to the static April-2025 snapshot when the overlay is empty (no ANTHROPIC key / poll failed). | 24h merged; overlay 7d |
| `POST /api/tariffs/refresh` | Admin (Bearer ADMIN_SECRET): flush overlay cache + force Federal Register re-poll + Haiku extraction. Bypasses the 7-day auto window; deduped by document number so only unparsed docs cost an LLM call. | — |
| `GET /api/economy/yield-curve-history` | 1Y daily OHLCV for 3m/5y/10y/30y yields → { series: [{date,us3m,us5y,us10y,us30y}], lastUpdated } | 6h |
| `GET /api/economy/events` | High-impact USD economic events (FF Calendar + FOMC static fallback) → { events, lastUpdated } | 12h |
| `GET /api/heatmap` | Performance heatmap (sectors/regions) | 15m |
| `GET /api/heatmap/assets` | Heatmap per-category assets (?category=) | 30m |
| `GET /api/heatmap/treemap` | Market-cap-weighted treemap for an index. `?index=sp500\|ndx\|dji\|russell2000\|ftse100\|dax40\|nikkei225\|hsi\|nifty50`, `&limit=N` (UI sends 500), `&timeframe=1d\|1w\|1m\|ytd`. FX-normalised to USD. Plan-gated: Pro+. | constituents 24h + quotes 5m |
| `GET /api/exposure/analysis` | AI tariff exposure analysis (Pro+ plan) | 24h |
| `POST /api/billing/webhook` | RevenueCat subscription event webhook | — |
| `POST /api/auth/send-verification-email` | Sends FinBrio-branded verification email via Resend. Requires `Authorization: Bearer <Firebase ID token>`. Rate-limited 3/min. → `{ sent: boolean, fallback?: boolean }` | — |
| `GET /api/quiver/congress` | Top-10 congress buys (FMP → Quiver, 500 if both fail — no hardcoded snapshot). **Not called by either client since 2026-07** (Congress tab removed — both sources dead); route kept in case a working source appears. | 4h |
| `GET /api/quiver/lobbying` | Top-10 by QoQ lobbying spend growth (Senate LDA — confirmed live) | 4h |
| `GET /api/quiver/insider` | Top-10 by insider buy count — 90-day window (SEC EDGAR — confirmed live) | 4h |
| `GET /api/quiver/congress-trades` | Raw congress trades last 365 days (?ticker=&chamber=&type=) (FMP/Quiver, both dead). **Not called by either client since 2026-07.** | 4h |
| `GET /api/house-trades` | House PTR trades via FMP (requires FMP_API_KEY, plan doesn't include this data — returns empty). **Not called by either client since 2026-07.** | 4h |
| `GET /api/oge/trump-transactions` | Presidential transactions ≥ $100K from OGE Form 278-T PDFs | 7d |
| `POST /api/oge/trump-transactions/refresh` | Force-bust OGE cache + re-run PDF pipeline | — |
| `GET /api/etf/list` | ETF Explorer list. `?category=sector\|broad\|international\|fixed_income\|commodity\|thematic\|leveraged` (omit for all 42). Quote via `fetchYahooPrice`; MoM/QoQ/YoY rolling-window returns via `fetchRangeData` (1mo/3mo/1y, not calendar-quarter-aligned — mirrors `/api/sectors`). No AI signal (removed — not shown in UI). Free, no plan gate. | 60m |
| `GET /api/etf/:symbol/profile` | ETF fund data — holdings, sector weights, expense ratio, AUM. Via `fetchYahooFundData()` (separate Yahoo `topHoldings`/`fundProfile`/`defaultKeyStatistics` modules, does not touch `fetchYahooQuoteSummary`). | 24h |
| `GET /api/etf/rotation` | RRG rotation view for sector/broad/international/thematic ETFs (leveraged/fixed_income/commodity excluded — not meaningful on an SPX-relative RRG). Via `getEtfRotationQuadrants()` in `economy.ts` (separate from `getSectorQuadrants()` — does not touch `/api/sectors`). | 15m |

### Exact API Response Shapes

These differ from what you'd guess — get them wrong and parsing silently fails:

```
GET /api/futures/indices      → { items: [...], lastUpdated }
GET /api/volatility/assets    → { items: [...], vix: { price, ... } }
                                  ^^^^ NOT data['assets'], NOT data['vix'] directly
GET /api/trading/backtest/:s  → { strategies: { "1": { winRate, totalReturn, maxDrawdown, sharpe, trades, tradeLog }, "2": ..., "3": ... } }
                                  ^^^^ nested under 'strategies', field is 'sharpe' not 'sharpeRatio', 'trades' not 'totalTrades'
GET /api/trading/signals/:s   → TradingSignal object  (strategy query param: "1"–"9"; S9 = Silver Liquidity Sweep, SI=F only)
                                  Carries priceType: "spot"|"futures"|null. For SPOT_OVERLAY symbols (gold today)
                                  the entry + SL/TP + 1d candles are computed on the real spot feed, not futures.
GET /api/trading/news/:s      → articles array  (field is 'url', NOT 'link')
GET /api/search               → { results: [{ symbol, name, exchange, type }] }
GET /api/bonds                → { us3m, us5y, us10y, us30y, spread3m10y, curveStatus, lastUpdated }
GET /api/sectors              → { sectors: [{ emoji, name, changePercent, perf1W, perf1M, perf3M, perf6M, perf1Y, perf3Y, perf5Y, rsRatio, rsMomentum }], lastUpdated }
                                  rsRatio/rsMomentum are SPX-relative Relative Rotation Graph values (centred at 100)
GET /api/crises               → { crises: [...], dataAsOf: CRISIS_DATA_REVIEWED_AT (e.g. "June 2026"), lastUpdated: ISO }
GET /api/tariffs              → { countries: [CountryTariff], dataAsOf: "April 2025", lastUpdated: "2025-04-09T00:00:00.000Z", source: string }
                                  CountryTariff: { countryName, countryCode, tariffRate, sectors: [SectorTariff], debtToUSA: [DebtDetail], laymanExplanation, lastUpdated, impactScore }
                                  impactScore: 0-100, server-computed in computeTariffImpactScore() (economy.ts) — rate (60pts) + sector breadth (20pts) + debtToUSA USD exposure capped at $1T (20pts). Not stored in tariffs.json.
                                  SectorTariff: { sectorName, tariffRate, sourceURL }
                                  DebtDetail: { category, amountBillions, notes }
                                  Data file: server/data/tariffs.json — update and bump TARIFFS_DATA_AS_OF in economy.ts to refresh without an app release
GET /api/trading/quotes       → { quotes: [...], timestamp }
                                  ^^^^ key is 'quotes', NOT 'items'
                                  Each quote has priceType: "spot"|"futures"|null. SPOT_OVERLAY symbols (gold today)
                                  serve the Twelve Data spot price (polled 10m, leader-only) instead of the Yahoo
                                  futures price; pre-market fields are null for spot. Falls back to futures when the
                                  spot feed is empty (no key / follower / transient fail). Markets tab is untouched.
GET /api/heatmap              → { regions: [tile], assetClasses: [tile], lastUpdated }
                                  ^^^^ NOT 'tiles' — tile = { name, emoji, changePercent, perf1W…perf5Y }
GET /api/heatmap/movers       → { index, session, marketState, gainers: [TreemapStock], losers: [TreemapStock], lastUpdated }
GET /api/heatmap/assets       → { tiles: [...], category, lastUpdated }
GET /api/heatmap/treemap      → { index, timeframe, limit, total, stocks: [TreemapStock], lastUpdated, marketState? }
                                  TreemapStock: { symbol, name, sector, marketCap, changePercent, price,
                                                  dayHigh?, dayLow?, fiftyTwoWeekHigh?, fiftyTwoWeekLow?,
                                                  sparkline?, preMarketPrice?, preMarketChangePercent?,
                                                  postMarketPrice?, postMarketChangePercent?,
                                                  nativeCurrency, marketCapUsd?, fxRateUsed?, buyVolumeSignal }
                                  total = resolved-from-Yahoo count (≤ constituent count).
                                  marketCap is native-currency; marketCapUsd is FX-normalised USD (null when FX fetch failed).
                                  effectiveMarketCap = marketCapUsd ?? marketCap — use this for tile sizing.
                                  marketState: "REGULAR"|"PRE"|"POST"|"POSTPOST" — from lead stock in index.
                                  buyVolumeSignal (US-002): gold-ring "strong 30-min buying" flag. Computed ONLY on
                                  timeframe=1d during REGULAR hours, for the top-50 tiles by market cap (BUY_VOLUME_TOP_N).
                                  = volume-weighted A/D money-flow over the trailing 30 one-minute bars ≥ 0.30 AND window
                                  return ≥ 0. Always false on 1w/1m/ytd and pre/post/closed — no intraday fetches happen
                                  there. Zero-$ (free Yahoo 1m chart). Clients draw a gold ring; both clients also
                                  navigate a tile → /asset/:symbol (mobile via tooltip "View details" button; web on click).
GET /api/exposure/analysis    → { comps: [{ name, ticker, revenueExposurePct, earningsImpactPct }], summary }
GET /api/usa-debt             → { recordDate, totalDebt, totalDebtFormatted, debtPerCitizen, debtToGdpRatio,
                                  dailyIncrease, debtGrowth20yr, fiscalYtdLabel, annualDeficit, revenueVsSpending,
                                  interestPayments, foreignHolders: {asOf, japan, china, uk, canada, india, totalForeign},
                                  spending: {socialSecurity, medicareMedicaid, defense, netInterest, everythingElse} | null }
                                  Any field can be null if its live source (Treasury or World Bank) failed — client must
                                  fall back to "—", never re-hardcode a number. annualDeficit/revenueVsSpending/interestPayments/
                                  spending are fiscal-year-to-date (see fiscalYtdLabel), not full-year, despite the field names.
                                  debtPerTaxpayer, ssUnfunded, medicareUnfunded were removed entirely — no live source exists
                                  (taxpayer count and SS/Medicare unfunded liabilities are annual actuarial-report figures with
                                  no API). Do not re-add them as hardcoded values.
GET /api/quiver/congress      → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
GET /api/quiver/lobbying      → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
GET /api/quiver/insider       → { items: [QuiverItem], meta: { label, rebalance }, lastUpdated }
                                  QuiverItem: { symbol, name, price, changePercent, weight, rank, badge, badgeLabel, lobbyingGrowth? }
                                  lobbyingGrowth (only populated on /api/quiver/congress items): the ticker's QoQ lobbying badge
                                  (e.g. "+42%") when it also appears in the current /api/quiver/lobbying top-10 — cross-link computed
                                  via getLobbyingBadgeMap() in quiver.ts, null otherwise. Not populated on the /lobbying or /insider responses themselves.
GET /api/quiver/congress-trades → { trades: [CongressTrade], total, lastUpdated }
                                  Supports ?memberName= filter to get a single member's trades.
                                  CongressTrade: { memberName, chamber, ticker, name?(company), assetDescription, type("buy"|"sell"),
                                                  transactionDate, filingDate, amount, amountMidpoint?, party?, state?, lobbyingGrowth? }
                                  lobbyingGrowth: same cross-link join as above, applied per-trade by ticker.
GET /api/house-trades         → { trades: [HouseTrade], total, lastUpdated }
                                  HouseTrade fields mirror FMP response (disclosure_year, disclosure_date,
                                  transaction_date, owner, ticker, asset_description, type, amount,
                                  representative, district, state, ptr_link, cap_gains_over_200_usd)
GET /api/oge/trump-transactions → { transactions: [OgeTransaction], total, lastUpdated, loading? }
                                  OgeTransaction: { description, type("purchase"|"sale"|"exchange"),
                                                    date(YYYY-MM-DD), amount("$X - $Y"),
                                                    amountMidpoint, filingDate, source(PDF filename) }
                                  loading=true when the server PDF pipeline is still running.
GET /api/etf/list             → { category, items: [EtfItem], lastUpdated }
                                  EtfItem: { symbol, name, emoji, category, risk("leveraged"|null),
                                             price, changePercent, preMarketPrice, preMarketChangePercent,
                                             perf1M, perf3M, perf1Y }
                                  perf1M/perf3M/perf1Y: rolling-window % change (trailing 1mo/3mo/1y via
                                  fetchRangeData), i.e. MoM/QoQ/YoY — NOT calendar-quarter-aligned. Any can
                                  be null if the Yahoo range fetch failed for that ETF.
GET /api/etf/:symbol/profile  → { symbol, expenseRatio, aum, family, holdings: [EtfHolding],
                                  sectorWeightings: [EtfSectorWeighting], lastUpdated }
                                  EtfHolding: { symbol, name, weightPct }
                                  EtfSectorWeighting: { sector, weightPct }
GET /api/etf/rotation         → { items: [EtfRotationItem], lastUpdated }
                                  EtfRotationItem: { symbol, name, emoji, category, rsRatio, rsMomentum,
                                                     quadrant("Leading"|"Improving"|"Weakening"|"Lagging"|null) }
```

Plan-gated endpoints return `403 { error: "...", code: "PLAN_REQUIRED" }` when the device lacks entitlement.

### Environment Variables

```
FINNHUB_API_KEY                    optional — Finnhub WebSocket for sub-second crypto prices
AI_INTEGRATIONS_OPENAI_API_KEY     optional — GPT-4o-mini AI market briefings (volatility briefing + futures news summary)
AI_INTEGRATIONS_OPENAI_BASE_URL    optional — custom OpenAI-compatible base URL (defaults to api.openai.com)
ANTHROPIC_API_KEY                  optional — Claude Haiku for AI analyst notes + AI tariff exposure analysis
ALPHA_VANTAGE_API_KEY              optional — Alpha Vantage for fundamentals/historical data fallback
TWELVE_DATA_API_KEY                optional — Twelve Data. (1) EPS history (fetchTwelveDataEarnings).
                                              (2) SPOT price overlay for the Trading tab: commodities Yahoo only
                                              serves as FUTURES (=F, priced above spot by cost of carry) get a real
                                              spot feed keyed by the SAME Yahoo symbol. Free plan = gold (XAU/USD)
                                              only; silver/oil/copper need the Grow/Venture paid plan (see
                                              SPOT_OVERLAY in trading.ts). Absent → all commodities stay futures.
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
RESEND_API_KEY                     optional — Resend API key for FinBrio-branded verification emails
                                              (/api/auth/send-verification-email). Firebase locks editing of its own
                                              built-in verification-email template (anti-spam policy, no override
                                              possible), so branding requires generating the link via Admin SDK and
                                              sending it ourselves. Absent = client falls back to Firebase's stock
                                              sendEmailVerification() email.
RESEND_FROM_ADDRESS                optional — sender address for the above (default: "FinBrio <noreply@finbrio.net>").
                                              Requires finbrio.net to be domain-verified in Resend (SPF/DKIM records).
```

All features degrade gracefully when keys are absent.

---

## Flutter App (Moby)

Located in `moby/`. Production base URL is `https://monysa-api.fly.dev`; override with `--dart-define=API_BASE_URL=http://localhost:5001` for local dev.

### dart-define Variables

```
API_BASE_URL           override server URL (default: https://monysa-api.fly.dev)
APP_SIGNING_SECRET     HMAC signing secret; absent = dev mode (no X-Signature header sent)
DEV_PLAN               bypass plan gates in dev/TestFlight builds (value: pro)
REVENUECAT_IOS_KEY     RevenueCat iOS API key
REVENUECAT_ANDROID_KEY RevenueCat Android API key
SENTRY_DSN             Sentry DSN; absent = development mode (errors not forwarded)
```

### Directory Structure

```
moby/lib/
  main.dart                        # ProviderScope + runApp + RevenueCat + Sentry init
  app.dart                         # MaterialApp.router (title: 'FinBrio') + AppShell (bottom nav, 5 tabs)

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
    restart_widget.dart            # RestartWidget — wraps app for forced hot restart (used by the Profile dev
                                   # Plan simulator toggle only; chart provider switching does NOT use this —
                                   # see chart_provider_provider.dart, it's fully reactive with no restart needed)
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
    repositories/
      markets_repository.dart      # fetchIndices, fetchCommodities, fetchForex, fetchCotMetals
      trading_repository.dart      # fetchQuotes, fetchSignal, fetchHistory, fetchBacktest, fetchNews, searchStocks
      volatility_repository.dart   # fetchVolatilityAssets, fetchBriefing
      debt_repository.dart         # fetchDebt
      heatmap_repository.dart      # fetchHeatmap, fetchAssets(category), fetchTreemap(index, limit) — client-side 15m/30m/5m TTLs
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
      investing_screen.dart        # 7 sub-tabs: Exposure / Dashboard / Multibaggers / Presidential / Smart $ / Earnings Calendar / ETFs
                                   # (Congress + House Trades removed 2026-07 — dead data sources, see Known Pitfalls)
      multibaggers_screen.dart     # Multibaggers screen (/trading/multibaggers?country=us); default country=US; country-aware stock search
      etf_explorer_tab.dart        # EtfExplorerTab — category chips + List/Rotation toggle. List: tap row → /asset/:symbol;
                                   # info icon → bottom sheet (EtfProfilePanel-equivalent) with holdings/sector weights/expense
                                   # ratio/AUM. Rotation: quadrant-grouped list (Leading/Improving/Weakening/Lagging), reusing
                                   # /api/etf/rotation. Uses etf.dart models + EtfRepository (DiskCache pattern).
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
    chart_provider_provider.dart   # ChartProviderNotifier (yahoo | tradingview) — persisted; set() applies instantly
                                   # (reactive Riverpod state + currentChartRenderer global read fresh per request
                                   # by ChartRendererInterceptor) — no restart needed or triggered
    font_size_provider.dart        # FontSizeScaleNotifier (regular=0.9x | enlarged=1.0x) — persisted; applied as
                                   # textScaler in app.dart; default is 'regular' (0.9x scale)

  services/
    entitlement_service.dart       # EntitlementService — Plan enum (free/pro), feature gates, RC integration

  shared/widgets/
    chart_modal.dart               # Candlestick bottom sheet (Lightweight Charts v4 via WebView)
    max_width_layout.dart          # Centers + caps content at 720px for tablet/landscape
    error_view.dart                # Generic error + retry widget
    freshness_bar.dart             # FreshnessBar(lastUpdated) — "X ago" banner bar
    glass_card.dart                # Frosted-glass card container
    performance_heatmap.dart       # PerformanceHeatmap(tiles) — color-coded grid, timeframe selector (1D–5Y)
    pro_blur_overlay.dart          # ProBlurOverlay(child, isPositive, feature) — blurs child behind a gain/loss-tinted
                                   # "Upgrade to Pro" overlay; tap opens UpgradeSheet. Used for partial-reveal Pro gates
                                   # (Markets Forex rate-comparison label, CFTC per-category reveal) — reuse, don't duplicate.
    rrg_quadrant_grid.dart         # RrgQuadrantGrid(leading, improving, weakening, lagging) — 2x2 colored RRG quadrant
                                   # grid with pill-chip items, non-interactive. Shared between Macro's Sector Rotation
                                   # and ETF Explorer's Rotation view — reuse for any future RRG-quadrant visual.
    sector_treemap.dart            # SectorTreemap — two-level squarified treemap (Bruls/Huijz/van Wijk),
                                   # sector grouping, background-coloured boundary outlines, tap → tooltip card
    settings_sheet.dart            # SettingsSheet — chart provider switcher (requires restart confirmation)
    shimmer_list.dart              # ShimmerList(count, type) — animated shimmer loading skeleton for list screens.
                                   # ShimmerRowType: market | signal | scannerCard (scannerCard mirrors a
                                   # symbol-chip+name+price+%chip header, signal pills, and a signal-count/dots
                                   # row — used by Multibaggers AND Trading → Power Moves, since both cards share
                                   # that exact shape; reuse for any other pill+dots scanner card rather than a
                                   # bespoke skeleton). Investing → Presidential/Smart $ use local
                                   # Shimmer.fromColors-wrapped skeletons in investing_screen.dart
                                   # (_PresidentialSkeleton, _QuiverSkeleton) since those card shapes are
                                   # one-off, not reused elsewhere.
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

**Markets** (`/markets`): 5 sub-tabs — **Heatmap** (default) / Indices / Commodities / Forex / CFTC. Each price tab has inline search; forex is grouped by region when not searching, flat list when searching; CFTC metals section hides during search; tap any row → `ChartModal` bottom sheet. The Heatmap tab is a market-cap-weighted treemap with index-selector chips (S&P 500 / NASDAQ 100 / Dow Jones / Russell 2000 / FTSE 100 / DAX 40 / Nikkei 225 / Hang Seng / Nifty 50) and timeframe chips (1D / 1W / 1M / YTD). Tile size = USD-normalised market cap (`effectiveMarketCap`), tile colour = % change for selected timeframe. Tap a tile → centred tooltip card. **The Heatmap tab itself is free** — all 9 indexes + the 1D timeframe are open to everyone; only the 1W/1M/YTD timeframe chips are Pro-gated (`heatmap_extended_timeframes`, lock icon shown on the chip for free users, tapping shows the paywall instead of switching). Forex rows show a rate-comparison sub-label (`_FxDifferential` — base vs quote central-bank rate) that is Pro-gated (`forex_rate_comparison`): free users see it blurred with a green/red tint (matching the differential's sign) and an "Upgrade to Pro" overlay via `ProBlurOverlay` (shared/widgets/pro_blur_overlay.dart). CFTC category chip order is Metals / Energy / Indices & Rates / Agriculture / Currencies; within each category only the first asset is shown with real values (`cftc_categories` gate) — the rest are blurred the same way, regardless of which category chip is active.

**Trading** (`/trading`): **five** sub-tabs — Instruments / Dashboard / Power Moves / Signals / Alerts.
- Instruments (`_DashboardTab`): category chips (in order, NO "All"): ★ Watchlist / Commodities / Indices / Stocks / Forex / Crypto. "Stocks" chip switches to full-text search (debounced 400ms, calls `/api/search`). Other chips show 49 live asset rows with 30s auto-refresh.
- Dashboard (`_DashboardzTab`): `BestSetupsCard` (scanner best-setups, type=assets, v1/v2 toggle).
- Power Moves: see Power Moves note below.
- Signals: type filter ALL/Commodities/Indices/Forex/Crypto + strategy selector **S1–S9** (`TradingStrategy` enum is s1…s9; S9 "Silver Liquidity Sweep" filters list to SI=F only). Info icon opens strategy explainer sheet.
- Alerts: badge count on tab icon when alerts are active.

**Investing** (`/investing`): **7** scrollable sub-tabs — **Exposure** (default) / Dashboard / Multibaggers / Presidential / Smart $ / **Earnings Calendar** (`earnings_calendar_tab.dart` — `/api/trading/earnings-calendar?days=`, S&P 500 universe; items have `symbol/name/sector/earningsDate/marketCap/marketCapFormatted/epsForecast/lastYearEps/epsGrowthPct/numEstimates/time`. epsGrowthPct = server-computed YoY consensus growth (est vs last-year actual), null when last year missing/zero. Tab has day chips (7/15/30) + mega-cap toggle + sector filter chips + symbol/name search, sticky per-date headers, a "N reporting · Busiest <day>" summary, YoY growth badges, pre/after-market timing icons, and tappable rows → `/asset/:symbol`) / **ETFs**. (Congress and House Trades tabs were removed 2026-07 — see Known Pitfalls.)
- Exposure: embeds `ExposureBody` from `exposure_screen.dart` — shows browsable/searchable/sortable list of 113+ countries with their US tariff rates and `impactScore` (from `/api/tariffs`). Sort options: Market Size (GDP proxy, default) / Rate / Name. **Free, no plan gate.** This is tab index 0 — the default landing tab. (The AI analysis endpoint `/api/exposure/analysis` still exists on the server, plan-gated Pro+, but the Flutter tab no longer calls it.) Tapping a country opens `CountryDetailScreen` (`features/country/country_detail_screen.dart`) — tariff rate, layman explanation, sector rates, and debt exposure are all free; only the **"View Top Listed Stocks" button is Pro-gated** (`country_top_stocks`), for every country. Web has no equivalent detail page (its Exposure tab is an inline expand/collapse row, no drill-in), so this gate is mobile-only.
- Dashboard: Best Setups (plan-gated: Pro+).
- Multibaggers: full-screen push to `/trading/multibaggers?country=us` (default US). Country chips: 🇺🇸 US / 🇮🇳 India / 🇬🇧 UK / 🇯🇵 Japan / 🇭🇰 HK / 🇨🇳 China / 🇪🇺 Euronext. Has country-aware stock search (search bar filters results by country via Yahoo Finance symbol suffix + exchange code).
- Presidential: OGE Form 278-T transactions ≥ $100K — fetches `/api/oge/trump-transactions`. **The newest filing batch is Pro-gated** (`presidential_latest_filing`): the cutoff is the max `filingDate` across the full unfiltered response (not the currently filtered/sorted view, so search/sort never shifts it). Rather than blurring every record in that batch individually (it can be hundreds of rows), the whole batch collapses into a single compact `_PresidentialLatestFilingTeaser` row ("N latest filings · Filed <date> — Upgrade to Pro"), immediately followed by the real, unblurred earlier filings. Same collapse-to-one-row logic ported to web (`InvestingPage.tsx` `PresidentialTab`, `.presidential-teaser` CSS) as a visual-only teaser.
- Smart $: `_QuiverTab` — 2 strategies (was 3; Congress Buys removed 2026-07): Lobbying Growth (S1) + Insider Buys (S2), both QuiverItem lists. Lobbying items carry a `lobbyingGrowth` cross-link badge when the same ticker also shows up rising in that data.
- ETFs: `EtfExplorerTab` — category chips (Sector/Broad Market/International/Fixed Income/Commodity/Thematic/Leveraged-Inverse) over a curated 42-ETF universe (`server/data/etf_universe.ts`). List view shows live quote per ETF plus a MoM/QoQ/YoY rolling-window return strip (trailing 1mo/3mo/1y — not calendar-quarter-aligned; mirrors `/api/sectors`' pattern), **Pro-gated** (`etf_performance_metrics`): exactly **one ETF in the whole list** (picked randomly once per list load, not per row) has its strip fully revealed and is moved to the top of the list so it's visible without scrolling; every other ETF's entire 3-metric strip is blurred as a single unit via `ProBlurOverlay`/`ProBlur` (no AI signal — removed from the page); tapping a row pushes to `/asset/:symbol` for chart/signal/backtest/news. Info icon opens a bottom sheet with fund data (holdings, sector weights, expense ratio, AUM) from `/api/etf/:symbol/profile`. Rotation toggle switches to an RRG quadrant view (`/api/etf/rotation`) for equity-like categories only (fixed income/commodity/leveraged excluded) — selecting Rotation auto-resets the category chip to All, since 3 of the 7 categories have no rotation data.

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

## Web Frontend (frontend/)

pnpm monorepo (pnpm 9 — Node 20 can't run pnpm 11) for the browser client. Same Express API as mobile; **real plan enforcement (auth/session/purchase) is intentionally absent on web for now** — there's no sign-up/sign-in, so every visitor is treated as free tier by default. 10 spots mirror mobile's Pro gates as permanent, visual-only `ProBlur` teasers (never unlock — see below); all other content is free/open, same as before.

```
frontend/
  packages/contracts    # zod schemas for every API response — single source of truth for shapes.
                        # Response-shape changes MUST update this first; web build fails at compile time.
  packages/api-client   # typed fetch layer; every method parses with its contract schema.
                        # Plain GETs, no custom headers → no CORS preflight; browser handles ETag/304.
  packages/ui           # tokens.css = 1:1 port of AppPalette (dark+light via [data-theme]) + primitives + formatters.
                        # ProBlur(children, positive) — visual-only "Upgrade to Pro" teaser (blur + green/red tint via
                        # color-mix), mirrors mobile's ProBlurOverlay. Web has no purchase flow, so this never unlocks.
                        # 10 gated spots as of 2026-07: Markets Heatmap 1W/1M/YTD, Forex rate-comparison label, CFTC
                        # partial reveal, ETF perf strip, Correlation matrix, Presidential latest filing (all pre-existing),
                        # plus Best Setups (Investing→Dashboard + Trading→Dashboard, shared BestSetupsCard), Sector Best
                        # Setups, Signals S4–S9/enhanced strategies (Trading→Signals — chips stay clickable, result table
                        # blurs), AI Macro Briefing (Macro→Dashboard — click shows a blurred static teaser, does NOT call
                        # the paid /api/volatility/briefing endpoint, so a locked feature never burns AI spend). Trading→
                        # Alerts caps free tier at 3 alerts (hardcoded, mirrors RemoteConfigService.alertLimitFree's
                        # default of '3') with an inline message instead of a ProBlur — it's an action limit, not content.
  packages/charts       # lightweight-charts v4 candlesticks, canvas Sparkline, squarified CanvasTreemap
  apps/web              # Vite + React 19 SPA — TanStack Router (code-based routes), TanStack Query, cmdk ⌘K palette.
                        # Deployed to Vercel at https://app.finbrio.net via `./deploy_web.sh` (repo root).
  apps/site             # Astro marketing site (self-hosted variable fonts, no other frontend/web dep).
                        # Deployed to Vercel at https://www.finbrio.net via `./deploy_site.sh` (repo root).
                        # `DownloadCta.astro` + `config/stores.ts` render iOS/Android/Web badges — iOS and
                        # Android are `available: false` ("Coming Soon", no mobile app shipped yet); `web`
                        # is `available: true` pointing at app.finbrio.net, rendered with equal visual
                        # weight (same `.badge--live` styling, no reprioritization) since it's the only
                        # live product today.
```

- **Run**: `pnpm install && pnpm dev` from `frontend/` → http://localhost:5173 (talks to localhost:5001 in dev; prod default `https://monysa-api.fly.dev`, override with `VITE_API_BASE_URL`).
- **Internal-package pattern**: workspace packages export raw TS (`"main": "./src/index.ts"`); Vite compiles them — no per-package build step.
- **Caching**: Query `staleTime` mirrors server TTLs; `persistQueryClient` (localStorage, `buster: "v1"`) replicates DiskCache hydrate-stale-then-refresh. Bump the buster when a persisted shape changes (mirror of `DiskCache._schemaVersion`).
- **Routes** (mirror mobile tab structure): `/markets` (Heatmap/Indices/Commodities/Forex/CFTC), `/trading` (Instruments/Dashboard/Power Moves/Signals S1–S9/Alerts — watchlist+alerts in localStorage), `/investing` (Exposure/Dashboard/Multibaggers/Presidential/Smart $/Earnings Calendar/ETFs — Congress/House Trades removed 2026-07), `/macro` (Dashboard w/ regime+gauges+heatmaps+yield graph+RRG quadrants+AI briefing / Crisis / Debt / Calendar / Correlation), `/asset/$symbol?name=`.
- **Parity rule**: the Flutter screens are the spec. When mobile gains/changes a tab, filter, or strategy, port it here in the same change (and vice versa) — and verify against the running screens, not this file alone.
- **Data-display parity (hard requirement)**: web and mobile must show *identical data*, not just identical UI structure. That includes field-picking logic — e.g. session-aware prices (`pre` → `preMarketPrice`/`preMarketChangePercent`, `post` → `postMarketPrice`/`postMarketChangePercent`, fallback to `price`/`changePercent`), filter sets, sort orders, and null fallbacks. When changing what one client displays, port the same logic to the other in the same change. Regression example: web MoversCard once showed last-close prices during pre-market because it ignored the session fields mobile already used — a critical bug for a financial app.
- **Prod CORS**: `ALLOWED_ORIGINS` on the API (Fly secret, comma-separated, additive — never drop an existing entry) must include both `https://www.finbrio.net` (marketing site) and `https://app.finbrio.net` (this SPA); `server/index.ts` already supports it. Custom headers `X-Device-ID`/`X-Signature` are in the CORS allow-list. CORS is a browser-only mechanism — it has no effect on the Flutter/TestFlight app's Dio requests, so changing this list never touches mobile. Separately, `http://localhost:5175` (the admin/ops portal's fixed dev port) is hardcoded into `setupCors` as `ADMIN_PORTAL_ORIGIN` and let through even when `isProd` is true — this is what lets the admin portal (which always targets production, see "Admin / Ops Portal" below) actually complete its `fetch()` calls instead of failing CORS preflight with a bare 403. Don't "clean up" this exception into the general `isLocaldev` catch-all (that one stays prod-disabled on purpose) or fold it into `ALLOWED_ORIGINS` — it's intentionally a separate, narrowly-scoped allowance for exactly one known local origin.

---

## Admin / Ops Portal (frontend/apps/admin)

Separate Vite/React app for production ops — users, subscriptions, remote config, cache busting, FCM broadcast, AI usage, and the "market buzz" social-post review queue. **Internal tool, not part of the product** — not linked from any user-facing surface.

- **Run**: `./admin.sh` (repo root) — starts only the Vite dev server on `:5175` and opens it in the browser. There is no local backend involved: the portal always talks directly to production.
- **API target defaults to production unconditionally** (not dev-vs-build-mode like the web app): `frontend/apps/admin/src/lib/api.ts`'s `BASE_URL` falls back to `https://monysa-api.fly.dev` whenever `VITE_API_BASE_URL` is unset. Deliberate — this portal is the gateway for real production actions (broadcast push to real devices, bust the live server's caches, edit real RevenueCat/Firestore-backed subscriptions), so accidentally pointing it at local dev would give a false read of leader status/cache state/logs instead of the real thing. Override only for deliberate local-API testing: `VITE_API_BASE_URL=http://localhost:5001 pnpm --filter @monysa/admin dev`.
- **Auth**: single `ADMIN_SECRET` Bearer token (`server/lib/admin-auth.ts`'s `authMiddleware`), entered on `/login`, stored in `localStorage`. Must match the `ADMIN_SECRET` Fly secret on the deployed app — a local `.env` value is irrelevant since there's no local backend in the loop.
- **MUST NEVER be served by the production Express server.** `server/index.ts` has no `/admin` static mount — one existed before and was removed deliberately, because it served `frontend/apps/admin/dist` whenever that folder happened to be present, which would expose this Bearer-token-gated, no-rate-limit ops surface at a guessable path on the public production domain. `frontend/apps/admin/dist/` is also excluded via `.dockerignore` as a second layer of defense, so a stray local build can't leak into the Fly image even if the serving code were ever reintroduced. **Do not re-add `/admin` static serving to `server/index.ts`, and do not remove the `.dockerignore` entry.** If the admin UI ever needs a real URL, deploy it as its own separate app (like `apps/web`/`apps/site` on Vercel) — never bundled into the API's own Docker image.
- Pages: Dashboard, Users, Subscriptions, Alerts, Remote Config, Ops (cache busting, OGE pipeline refresh, global earnings snapshot refresh — local-dev-only, 403s on Fly by design), Performance, Social Buzz (review queue for the market-buzz auto-posting pipeline — see `server/lib/social-buzz/`).
- **Performance → API Latency runs `fly logs` from inside the production container itself**: `/api/admin/logs/metrics` (`server/routes/admin.ts`) `spawn()`s the `fly` binary (using the `FLY_API_TOKEN` secret already on this app) to fetch the app's own recent logs and parse `[TIMING]` lines out of them. This is why the `Dockerfile` installs `flyctl` (as both `fly` and `flyctl` on `PATH`) even though nothing else in the app needs a CLI — don't remove that install step as unused/dead weight. `FLY_APP_NAME` doesn't need to be a secret; Fly auto-injects it on every Machine.

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
- **Chart provider**: `chartProviderProvider` (ChartProviderNotifier) — `yahoo | tradingview | inHouse`, switching applies instantly (no restart)

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

**Plan enum**: `Plan.free | Plan.pro` (two tiers only — no Insight/Enterprise)

**Feature gate keys** (pass to `EntitlementService.can()`):

| Key | Required plan |
|-----|--------------|
| `signals_advanced` | Pro+ |
| `analyst_notes_unlimited` | Pro+ |
| `alerts_unlimited` | Pro+ |
| `exposure_ai` | Pro+ (guards `/api/exposure/analysis` — AI analysis endpoint; the Flutter Exposure tab now calls `/api/tariffs` instead and is free) |
| `best_setups` | Pro+ |
| `backtest_filter` | Pro+ |
| `treemap_heatmap` | Pro+ (unrelated to the Heatmap **tab** — only gates the Profile dev-simulator now; the Investing → Dashboard Movers card is fully free (2026-07), do not re-gate it. Do not confuse with `heatmap_extended_timeframes` below) |
| `heatmap_extended_timeframes` | Pro+ (Markets → Heatmap tab's 1W/1M/YTD chips only — the tab and 1D are free) |
| `forex_rate_comparison` | Pro+ (Markets → Forex row's central-bank rate-comparison sub-label) |
| `cftc_categories` | Pro+ (Markets → CFTC: reveals all rows per category instead of just the first) |
| `presidential_latest_filing` | Pro+ (Investing → Presidential: newest `filingDate` batch is collapsed into one compact teaser row instead of blurring each record — every earlier filing is free) |
| `etf_performance_metrics` | Pro+ (Investing → ETFs list: exactly 1 randomly-picked ETF (of the whole list) has its full MoM/QoQ/YoY strip revealed and is sorted to the top of the list; every other ETF's strip is blurred as one unit, not per-metric — the pick is made once per list load, not per row/rebuild) |
| `country_top_stocks` | Pro+ (Investing → Exposure → Country Detail: the "View Top Listed Stocks" button, for every one of the 113+ countries — everything else on the detail screen (tariff rate, layman explanation, sector rates, debt exposure) stays free; free users see a lock icon on the button and tapping opens the paywall instead of navigating to `/country/:code/stocks`) |
| `macro_performance_timeframes` | Pro+ (Macro → Dashboard → Market Performance heatmap: 1D/1W are free, 1M/3M/6M/1Y/3Y/5Y are Pro. Timeframe chips always stay tappable and switch state for every user — only the resulting tile grid is blurred for free users on a gated timeframe, via `ProBlurOverlay`. Mobile-only: web's equivalent card (`MarketHeatmapsCard`) has no timeframe toggle at all, so there's nothing to gate there.) |
| `macro_correlation_timeframes` | Pro+ (Macro → Adv Correlation: 1M is free, 3M/6M/1Y are Pro. Window chips always stay tappable — only the correlation matrix is blurred for a gated window, via `ProBlurOverlay`/`ProBlur`. Web mirrors this as a permanent teaser (no purchase flow); the blurred preview is height-capped (440px / `max-height` on `.adv-corr-blur`) so the "Upgrade to Pro" text stays visible instead of being centered somewhere off-screen in the ~180-asset matrix.) |

**Dev bypass**: pass `--dart-define=DEV_PLAN=pro` to skip all plan gates.

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
| Strategy display name vs code/function name | re-adding old marketing labels ("Multi-Factor", "Professional Systematic") or renaming `strategyEnsemble`/`strategyAPEX` because the UI now shows a different name | Display names were rebranded 2026-08 to function-accurate labels — **S1** Core Signals · **S2** Volatility-Weighted · **S3** News Blend · **S4** Dual-Engine · **S5** Quant Regime · **S6** Adaptive News · **S7** APEX (Quality-Gated Regime Engine) · **S8** Consensus Vote · **S9** Silver Liquidity Sweep (kept); `+` variants inherit. Source of truth for the **full name** (ⓘ strategy info sheet, which is server-fed via `strategyDefsProvider` and shows all 18) = `STRATEGY_DEFS[].title` (server/trading.ts) + its offline fallback `kStrategyDefsFallback` in `providers/strategy_defs.dart` (**one shared file** feeding BOTH the Trading→Signals and Asset-Detail info sheets — do not re-hardcode a per-screen strategy list; a 3rd hardcoded copy in asset_detail_screen.dart was the "only shows S1–S8 / old names" bug, fixed by consolidating here) + `TradingStrategy.name` getter (strategy_provider.dart), plus the S8/S8+ runtime reasoning bullets. A **separate compact form** is shown under the S-code on the picker chips (all 4 pickers: Trading→Signals + Asset Detail, both platforms) — `TradingStrategy.shortName` (mobile) + `STRATEGIES[].name` (web `@monysa/contracts`), e.g. Core · Vol-Adj · News · Dual · Quant · Adapt News · APEX · Consensus · Silver. A full rename must update the title surfaces AND both short-form surfaces. Codes (`S1`–`S9`), `serverParam` (1–18), gating, and **internal function names + `//` comments intentionally still use the old terms** (`strategyEnsemble`, `// S5: Professional Systematic`) — display layer ≠ code layer; don't "fix" one to match the other. |
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
| Plan gate in dev mode | gates fire when APP_SIGNING_SECRET absent | dev mode = pro — all features unlocked; use DEV_PLAN dart-define to simulate a plan |
| Macro Calendar tab | Hardcoded FOMC/CPI/NFP/Jackson Hole dates | Dynamic: fetches `/api/economy/events` (FF Calendar feed); falls back to STATIC_EVENTS in server when feed is down |
| Treemap index count | 5 (S&P 500/NASDAQ 100/DJI/FTSE 100/Nifty 50) | 9 — also Russell 2000, DAX 40, Nikkei 225, Hang Seng |
| Calling plan-gated API without X-Device-ID | endpoint returns 403 | Dio SigningInterceptor adds X-Device-ID + X-Signature automatically |
| Investing default tab | Dashboard (index 1) | Exposure (index 0) — tab order is Exposure/Dashboard/Multibaggers/Presidential/Smart $/Earnings Calendar/ETFs (7 tabs; Congress + House Trades removed 2026-07). Exposure is now free (tariff browser); Dashboard is Pro+. |
| Congress/House Trades tabs | re-adding them because a user asks for congressional trade tracking | Removed 2026-07 — Quiver's public congress-trading API now 401s, and FMP's current plan returns an empty array for both senate-trading and house-trading. Don't rebuild these tabs without first confirming a real, working, non-paywalled data source exists (Senate Stock Watcher's GitHub JSON repo is Senate-only and was never wired in; House Stock Watcher's feed is dead as of 2026). The Smart $ tab's Lobbying Growth and Insider Buys strategies are unaffected — different providers (Senate LDA, SEC EDGAR), both confirmed live. |
| `mapNameToTicker`-style static company→ticker maps | adding more names to a hardcoded list when a company isn't found | For Insider Buys (arbitrary EDGAR filers): use `resolveTickerForName()` in `quiver.ts` — static map fast path + Yahoo search fallback, caches both ticker and real company name in `_resolvedNames` (don't fall back to bare ticker as the display name — use `_resolvedNames.get(ticker) ?? KNOWN_NAMES[ticker] ?? ticker`). For Lobbying Growth: don't reverse-resolve arbitrary filer names at all — query Senate LDA's `client_name` filter directly for each company in `LOBBYING_UNIVERSE` (a curated "which real companies to check" list, same pattern as `ETF_UNIVERSE`/`index_constituents.ts` — not fake data). This is both more reliable (only ever surfaces real, recognizable companies) and faster than random-page-sampling + fuzzy matching. |
| Senate LDA `filing_period_display` as a group-by key | trusting it to distinguish quarters | It's a bare label ("2nd Quarter (Apr 1 - June 30)") with **no year** — identical text every year. Grouping by it merges e.g. Q2-2025 and Q2-2026 into one bucket, corrupting QoQ sums and making almost every ticker fail a "≥2 distinct periods" check. Build the period key yourself from each row's own `filing_year` + `filing_type` fields instead (e.g. `${filing_year}-${filing_type.slice(0,2)}`). |
| ETF `perf1M`/`perf3M`/`perf1Y` ("MoM"/"QoQ"/"YoY") | assuming QoQ means calendar-quarter (Q1 vs Q4) | These are **rolling windows** — trailing 1mo/3mo/1y as of right now, via `fetchRangeData` (same pattern as `/api/sectors`). `perf3M` is NOT snapped to calendar-quarter boundaries. If a real calendar-quarter QoQ is ever needed, that's a different computation (snap start/end dates to quarter boundaries) — don't just relabel this field. |
| Senate LDA default query ordering | assuming results come back recent-first | Without `ordering=-dt_posted`, results come back **oldest-first** (1999 first, for a company with 25+ years of filings). `client_name=` + `ordering=-dt_posted` + a small `limit` is the reliable way to get a company's recent filings. |
| Extending `fetchYahooQuoteSummary` or `getSectorQuadrants` for new features | Adding params/modules directly to the existing function | Both back live endpoints (`/api/heatmap/treemap`, `/api/sectors`, `/api/trading/best-setups-sector`). Add a new sibling function instead (e.g. `fetchYahooFundData`, `getEtfRotationQuadrants`) so the existing live endpoints' behavior is provably unchanged — see `server/routes/etf.ts`. |
| Power Moves scanner location | InvestingScreen (10X tab) | Moved to TradingScreen as 4th tab "Power Moves" — _PowerMovesTab in trading_screen.dart |
| Stocks view in Power Moves | Stocks filter + search bar exist in scanner | Stocks view was removed — Power Moves is assets-only (Indices/Forex/Commodities/Crypto); Multibaggers handles country-specific stock scanning |
| Multibaggers default country | `?country=india` | `?country=us` — US is now the default and first chip |
| Markets sub-tabs | 4 (Indices/Commodities/Forex/CFTC) | 5 — **Heatmap** is now first and the landing sub-tab |
| Heatmap tab gating | entire tab Pro-gated (`treemap_heatmap`) | As of the timeframe-gate change, the tab + all 9 indexes + 1D are **free**; only 1W/1M/YTD require Pro (`heatmap_extended_timeframes`). `treemap_heatmap` still exists but now only gates the Profile dev-simulator — don't reuse it for anything in the Heatmap tab or the (fully free) Investing Movers card. |
| CFTC category chip order | Metals/Energy/Agriculture/Currencies/Indices & Rates | Metals/Energy/**Indices & Rates**/Agriculture/Currencies — reordered; keep mobile (`_chips` in markets_screen.dart) and web (`COT_GROUPS` in MarketsPage.tsx) in sync |
| `ProBlurOverlay` (mobile) / `ProBlur` (web) | building a new ad-hoc blur/paywall widget per feature | Shared widget already exists for "partially reveal Pro content" patterns — blurs child, tints green/red by sign, overlays "Upgrade to Pro". Used by Forex rate-comparison label and CFTC partial reveal; reuse it for any future partial-reveal gate rather than duplicating the blur/tint/overlay logic. |
| `RrgQuadrantGrid` (mobile) | building a new ad-hoc quadrant card layout per RRG feature | Shared 2x2 colored-quadrant-card widget already exists (`shared/widgets/rrg_quadrant_grid.dart`) — takes plain `{emoji,label}` lists per quadrant, not tied to sectors or ETFs. Used by Macro's Sector Rotation and ETF Explorer's Rotation view; reuse for any future RRG visual rather than re-building the Row-of-Rows/quadrant-card layout. |
| Small icon button next to a tappable row (mobile) | bare `GestureDetector`/`Icon` with no sizing | A raw `Icon` gives a hit-test area of only its glyph size (~16px) — taps land on the ancestor row's `InkWell` instead almost as often as they hit the icon. Use `IconButton` with `visualDensity: VisualDensity.compact` + explicit `constraints: BoxConstraints(minWidth: 32, minHeight: 32)` (see `_EtfRow`'s info button in etf_explorer_tab.dart) so the icon's own tap target actually wins the gesture. |
| List loading skeleton (mobile) | a bare bordered `Container` per row, no `Shimmer.fromColors`, no placeholder shapes | Reads as broken/empty content, not "loading" — found and fixed in 4 places independently (Multibaggers, Trading → Power Moves, Investing → Presidential, Investing → Smart $) before this pitfall was written down. Always wrap list skeletons in `Shimmer.fromColors` (tuned base/highlight per theme — see `shimmer_list.dart`) with placeholder shapes that mirror the real row's layout, not a single empty box. Reuse `ShimmerList`/`ShimmerRowType` when the shape matches an existing type (e.g. any pill+dots scanner card → `scannerCard`); only hand-roll a local `Shimmer.fromColors` widget for a genuinely one-off card shape. |
| Grid/mosaic loading skeleton (not a list) | reusing a row-list skeleton (`ShimmerList`/`SkeletonList`) for a treemap or other non-list layout | A stack of uniform-height rows reads nothing like a treemap's mosaic of variously-sized tiles. Markets → Heatmap has a purpose-built mosaic skeleton on both platforms instead: mobile `_TreemapSkeleton` (treemap_tab.dart, `Shimmer.fromColors` + nested `Expanded` rows/tiles) and web `TreemapSkeleton` (MarketsPage.tsx, flexbox rows of `Skeleton` blocks) — same row/tile flex ratios on both for visual parity. Build a shape-matched skeleton per screen rather than defaulting to the generic list skeleton when the real content isn't a list. |
| "This will restart the app" confirmation dialogs | assuming the dialog's copy describes what actually happens | Profile → Chart Provider used to show this and call `RestartWidget.restartApp()` on confirm, but `ChartProviderNotifier.set()` already applies the change synchronously (Riverpod `state = p` + the `currentChartRenderer` global, read fresh per-request by `ChartRendererInterceptor`) — the restart call was a no-op left over from an earlier, non-reactive implementation, so tapping "Yes" visibly did nothing. Fixed by dropping the restart call and the false claim (now: "Switch to X for chart data?" + a SnackBar). Before wiring `RestartWidget.restartApp()` into a new confirmation flow, verify the underlying state change genuinely isn't already reactive — most Riverpod/global-var settings in this app already are. |
| `ProBlurOverlay`/`ProBlur` "Upgrade to Pro" text in a narrow blurred area | using the default label unconditionally | The full phrase clips illegibly ("grade to P...") when the blurred content is a single small inline value (e.g. one metric chip, not a whole row/strip). Both widgets take an optional `label` override (mobile: `label:`, web: `label=`) — pass a short one (`'Pro'`) for that case; the default full phrase is fine once the blurred area spans a whole row or multi-metric strip (e.g. ETF perf strip, CFTC, Presidential, Heatmap). |
| `ProBlurOverlay`/`ProBlur` wrapping a very tall/unbounded block (web) | no `max-height` on the blur wrapper | The overlay text is centered via `position:absolute;inset:0` relative to the *entire* blurred content's height. For something short this is fine, but for e.g. a ~180×180 correlation matrix (thousands of px tall, no internal scroll), the "Upgrade to Pro" text ends up centered far below the viewport — invisible without scrolling deep into blurred content. Cap the wrapper's height (`.adv-corr-blur`'s `max-height: 440px` mirrors mobile's `Container(height: 440)`) so the overlay text stays within the visible preview. Always sanity-check a new `ProBlur` usage against genuinely large datasets, not just the first few rows. |
| Web plan enforcement | assuming web has zero gating anywhere (per the general "plan enforcement intentionally absent on web" rule) | Still true for real auth/session/purchase — web has no sign-up/sign-in, so it can't know a real user's plan. But since every visitor should therefore default to **free tier**, 10 spots render a **visual-only teaser** (blurred + "Upgrade to Pro", via `ProBlur` in `@monysa/ui`) that never unlocks: Heatmap 1W/1M/YTD, Forex rate-comparison label, CFTC partial reveal, ETF perf strip, Correlation matrix, Presidential latest filing, Best Setups (both Dashboard tabs), Sector Best Setups, Signals S4–S9/enhanced strategies, AI Macro Briefing. Trading→Alerts additionally caps free-tier adds at 3 (inline message, not a blur — it's an action limit). Don't build a real checkout for any of these — they're intentionally always-locked, mirroring mobile's Pro-only look without mobile's actual paywall. The Investing Dashboard Movers card is fully free on both platforms — do not add a teaser there. |
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
| Live-data endpoint has no real source | adding a hardcoded snapshot/constant so the field is never empty | `/api/quiver/congress` used to fall back to a hardcoded `CONGRESS_SNAPSHOT` array when Quiver+FMP both failed — removed (2026-07). If every live source for a field fails, return `null`/error and let the client show "—" or a retry state (both apps already have these). Never silently substitute a plausible-looking fake number — it's indistinguishable from real data to the user of a paid, marketed-as-real-time app. |
| USA Debt screen mostly hardcoded despite "LIVE" badge | trusting the field names / UI without checking the handler | As of 2026-07, `/api/usa-debt` sources totalDebt/dailyIncrease/debtGrowth20yr from Treasury `debt_to_penny`, gdp/population from World Bank, and deficit/spending/interest from Treasury MTS (fiscal-YTD, not annual — see `fiscalYtdLabel`). `foreignHolders` by country has no live source found (Treasury's TIC feed is stale, last update Jan 2023) and is kept but dated, not removed. `ssUnfunded`/`medicareUnfunded`/`debtPerTaxpayer` were removed outright — no live source exists for any of them. Before adding a new "debt clock" stat, check whether a real Treasury/World Bank endpoint exists first (see `server/routes/economy.ts` — `fetchMtsYtd`, `fetchMtsSpending`, `fetchDebt20yAgo`) rather than hardcoding a number to fill the gap. |

---

## Working — Screen Reference

| Screen | Functionality | Backend APIs Invoked | Free / Pro |
|--------|--------------|---------------------|----------------------|
| **Markets** `/markets` | 5 sub-tabs: **Heatmap** (default; market-cap-weighted treemap of 9 indices with timeframe selector 1D/1W/1M/YTD), Indices (46 global), Commodities (23), Forex (44 pairs grouped by region, rate-comparison sub-label), CFTC metals (hedge fund COT positions, 5 categories: Metals/Energy/Indices & Rates/Agriculture/Currencies). Inline search per price tab. Tap any row → candlestick chart modal; tap a treemap tile → tooltip card. | `/api/futures/indices` `/api/futures/commodities` `/api/futures/forex` `/api/futures/cot-metals` `/api/central-bank-rates` `/api/heatmap/treemap` | **Free**: Heatmap tab (all indexes, 1D), Indices, Commodities, Forex prices, CFTC (1 asset/category). **Pro**: Heatmap 1W/1M/YTD (`heatmap_extended_timeframes`), Forex rate-comparison label (`forex_rate_comparison`), CFTC remaining assets per category (`cftc_categories`) — all three render as a blurred teaser with an "Upgrade to Pro" overlay for free users. |
| **Trading** `/trading` | 4 sub-tabs: Dashboard (49 live assets, 30s refresh; category chips; Stocks chip = full-text search), AI Signals (S1–S3 strategy selector; BUY/HOLD/SELL per asset), Alerts (price alerts, 10s poll), Power Moves (scanner: Indices/Forex/Commodities/Crypto with v1/v2/v3 Pine variants). | `/api/trading/quotes` `/api/search` `/api/trading/signals/:symbol` `/api/trading/strategies` `/api/trading/scanner/10x-v3/assets` `/api/trading/scanner/10x-v3/commodities` `/api/trading/scanner/10x-v3/forex` `/api/trading/scanner/10x-v3/crypto` `/api/trading/scanner/10x/assets` `/api/trading/scanner/10x-v2/assets` | **Free**: S1–S3 signals, basic alerts, Power Moves. **Pro** (`signals_advanced`): S4–S8/advanced strategies. **Pro** (`alerts_unlimited`): more than 3 active alerts. |
| **Investing** `/investing` | 7 sub-tabs (Exposure is default): Exposure (tariff country browser — free), Dashboard (Best Setups — Pro+), Multibaggers, Presidential (newest filing batch Pro-gated), Smart $ (Lobbying Growth + Insider Buys), Earnings Calendar, ETFs (MoM/QoQ/YoY strip Pro-gated). Congress/House Trades tabs removed 2026-07 (dead data sources — see Known Pitfalls). | `/api/tariffs` `/api/trading/scanner/best-setups` `/api/trading/best-setups-sector` `/api/trading/scanner/10x-v2/assets` `/api/search` `/api/oge/trump-transactions` `/api/quiver/lobbying` `/api/quiver/insider` `/api/trading/earnings-calendar` `/api/etf/list` `/api/etf/:symbol/profile` `/api/etf/rotation` | **Free**: Exposure, Smart $, Multibaggers, Earnings Calendar, ETFs (quote/price always; perf strip only for 1 randomly-picked ETF), Presidential (all but the newest filing). **Pro**: Dashboard tab (`best_setups`); Presidential's newest filing batch (`presidential_latest_filing`); every other ETF's perf strip (`etf_performance_metrics`). |
| **Macro** `/macro` | 5 sub-tabs: Dashboard (Market Stress Meter, Fear & Greed, VIX gauge, crisis assets sparklines, yield curve, sector rotation RRG, geopolitical infographic, AI macro briefing button), Crisis (historical crisis playbook), Debt (US live debt clock), Calendar (dynamic FOMC/CPI/NFP events from FF Calendar), Correlation (asset correlation matrix). | `/api/volatility/assets` `/api/volatility/fear-greed` `POST /api/volatility/briefing` `/api/bonds` `/api/sectors` `/api/heatmap` `/api/heatmap/assets` `/api/crises` `/api/usa-debt` `/api/economy/yield-curve-history` `/api/economy/events` `/api/trading/correlation` | **Free**: all content. **Pro** (`analyst_notes_unlimited`): AI Macro Briefing button (GPT-4o-mini stress analysis). |
| **Asset Detail** `/asset/:symbol` | 5 sub-tabs for any Yahoo Finance symbol: Chart (inline TradingView or Yahoo candlestick + fullscreen modal), Signal (AI BUY/HOLD/SELL with entry/SL/TP/reasoning), Indicators (fundamentals data), Backtest (walk-forward S1/S2/S3 results), News (headlines + sentiment). | `/api/chart/:symbol` `/api/trading/signals/:symbol` `/api/trading/backtest/:symbol` `/api/trading/news/:symbol` `/api/trading/analyst-note/:symbol` `/api/trading/fundamentals/:symbol` | **Free**: Chart, Signal, Backtest, News. **Pro** (`analyst_notes_unlimited`): Analyst Note inside Signal tab. |
| **Country Detail / Stocks** `/country/:code` `/country/:code/stocks` | Country overview (GDP, trade balance, military data from World Bank). Stocks list for that country; India has NSE/BSE exchange tabs. Tap stock row → Asset Detail (not a chart modal). | `/api/country-data/:code` `/api/stocks/:countryCode` | **All free.** |
| **Multibaggers** `/trading/multibaggers` | Full-screen country-specific 10X stock scanner. Country chips: 🇺🇸 US (default) / 🇮🇳 India / 🇬🇧 UK / 🇯🇵 Japan / 🇭🇰 HK / 🇨🇳 China / 🇪🇺 Euronext. v1/v2 version toggle. Min-signals filter. Country-aware stock search (type a name → suggestions filtered by selected country → tap → single-symbol scan). Three build modes: normal list / search suggestions / single-scan. | `/api/trading/scanner/10x/{country}` `/api/trading/scanner/10x-v2/{country}` `/api/trading/scanner/10x/single` `/api/search` | **All free.** |
| **10X Backtest** `/trading/10x-backtest` | Historical backtest viewer for 10X scanner signals. v1/v2 selector, type toggle (assets), signal filter chips, sortable win-rate/return table. | `/api/trading/scanner/backtest/:type?version=` | **Free** (basic). **Pro** (`backtest_filter`): advanced filter controls. |
| **Profile** `/profile` | Identity header, RevenueCat subscription card (upgrade/manage), theme toggle (dark/light), font size (Regular/Enlarged), chart provider (Yahoo/TradingView — restart required), about section. | None | **All free** (subscription card shows current plan; upgrading opens RevenueCat paywall). |
