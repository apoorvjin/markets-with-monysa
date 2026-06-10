# User Stories — Moby

> Backlog of user stories captured during development.
> Format: `As a <role>, I want <capability>, so that <benefit>.`
> New stories are appended under **Backlog**. Move to **In Progress** / **Done** as they advance.

---

## Done

### US-005 — Currency-normalize the treemap (USD with native footnote)
**As a** Pro+ user comparing global indices on Markets → Heatmap **I want** every tile's market cap shown in USD with the native-currency value as a secondary line **so that** I can meaningfully compare cross-index tiles (e.g. Reliance vs. Apple, FTSE vs. Nifty) without misreading INR/GBP/JPY as USD.
- Captured: 2026-06-07
- Completed: 2026-06-08
- Notes: Backend adds `nativeCurrency`, `marketCapUsd`, `fxRateUsed` to each `TreemapStock` via 30-min cached FX rates from Yahoo Finance (GBPUSD=X, EURUSD=X, USDJPY=X⁻¹, USDHKD=X⁻¹, USDINR=X⁻¹). Flutter uses `effectiveMarketCap` (`marketCapUsd ?? marketCap`) for tile sizing. Tooltip shows `$X.XB  (₹Y.YT)` for non-USD stocks with FX available; native-only with proper symbol (₹/£/¥/€/HK$) when FX fetch fails. `marketCap` field left unchanged (native value).

---

## Backlog

<!-- Add new stories below. Each entry: -->
<!-- ### US-XXX — Short title -->
<!-- **As a** <role> **I want** <capability> **so that** <benefit>. -->
<!-- - Captured: YYYY-MM-DD -->
<!-- - Notes: optional context -->

### US-001 — Heatmap tile opens Asset Detail
**As a** trader **I want** tapping a stock tile in the heatmap to open its Asset Detail screen **so that** I can drill into the chart, signals, backtest and news without leaving the workflow.
- Captured: 2026-06-06
- Notes: Tile tap currently opens a tooltip overlay (price/%change/marketCap/sector). Either replace the tooltip with `context.push('/asset/:symbol')`, or keep the tooltip and add a "View details" button + `onLongPress` → navigate. Asset Detail lives at `moby/lib/features/asset/asset_detail_screen.dart`.

### US-002 — Best Setups overlay on heatmap tiles
**As a** trader **I want** a visual marker (gold ring or corner pip) on heatmap tiles whose symbol has an active S1/S2/S3 BUY signal **so that** the heatmap doubles as a trade-idea radar.
- Captured: 2026-06-06
- Notes: Cross-feature integration with `/api/trading/signals/:symbol`. Backend `/api/heatmap/treemap` should join active-signal status per symbol (cached separately) or frontend can call a new batch endpoint `/api/trading/signals/active?symbols=...`. Render a thin gold border / corner triangle in `sector_treemap.dart` `_StockTile`.

### US-003 — Real-time treemap updates during market hours (Insight tier)
**As an** Insight-plan subscriber **I want** the treemap to update tile prices and colours in real time while markets are open **so that** I can monitor intraday moves without a manual refresh.
- Captured: 2026-06-06
- Notes: Today the server caches quotes for 5 min. Wire Finnhub WebSocket (already used for crypto in `server/index.ts`) to push deltas for top-N constituents when `marketState === REGULAR`. Frontend should patch existing `TreemapStock` records in place rather than re-fetching the whole payload. Plan-gate behind a new `treemap_realtime` rule (Insight+).

### US-004 — Time-machine slider on heatmap
**As a** macro investor **I want** a scrubbable timeline above the heatmap that lets me jump to "yesterday's close", "1W ago", "1M ago", or named crash dates (May 2020, Sept 2008) **so that** I can see how the index looked at a given point in history and compare regimes.
- Captured: 2026-06-06
- Notes: Backend needs `?asOf=YYYY-MM-DD` mode for `/api/heatmap/treemap` — derive each constituent's price/%change from Yahoo `chart` data for that date. Slider UI should integrate with Crisis Playbook screen (`/macro` Crisis tab) so tapping a historical crisis date deep-links to the matching heatmap snapshot.

### US-007 — Refresh stale static content (crisis playbook, tariffs, economic calendar)
**As a** user trusting Monysa for macro decisions **I want** the crisis playbook, tariff exposure data, and economic calendar to reflect the current state of the world (or clearly disclose when they were last updated) **so that** I don't act on year-old snapshots and lose trust in the app.
- Captured: 2026-06-07
- Notes: SWOT-identified trust risk. Three offenders: (1) `GET /api/crises` returns `dataAsOf: "May 2026"` — hardcoded in `server/routes/economy.ts`; (2) tariff table in `moby/lib/data/sources/tariffs_data.dart` is an April 2025 snapshot of 113 countries; (3) economic calendar in MacroScreen → Calendar sub-tab (`volatility_screen.dart`) hardcodes FOMC/CPI/NFP/Jackson Hole dates. Fixes: **(a) Crisis playbook** — keep static historical crises (1929, 2008, 2020 don't change) but auto-stamp `dataAsOf` from file mtime or build time, not a string literal; add a "last reviewed" admin note. **(b) Tariffs** — move from a Dart-bundled constant to `GET /api/tariffs` so updates ship without an app release; cache 24h; add `lastUpdated` field surfaced in a FreshnessBar above the Exposure tab. Source: USTR Section 301 list + WTO tariff database (manual quarterly refresh acceptable initially, document the SOP). **(c) Economic calendar** — replace hardcoded list with a live feed: Trading Economics free tier, FRED release calendar API, or Investing.com scrape (check ToS). New endpoint `GET /api/economic-calendar?window=7d|30d` returning `{ events: [{ ts, country, name, impact, actual?, forecast?, previous? }], lastUpdated }`. Cache 6h. UI: add FreshnessBar to each surface; if data is > N days stale, show a yellow warning chip rather than silently displaying it. Add a "Data sources & freshness" section to Profile → About. New env vars likely: `TRADING_ECONOMICS_API_KEY` or `FRED_API_KEY`. Acceptance: no user-visible string contains a hardcoded future date.

### US-009 — Alt-data expansion: institutional flows, insider clusters, options UA, central-bank flows
**As a** macro investor / professional trader **I want** Monysa to surface the alt-data feeds that hedge funds and prop desks actually watch — SEC Form 4 insider rolling windows, 13F position deltas, short-interest changes, ETF creation/redemption flows, options unusual activity, Fed Z.1 flow-of-funds, US Balance-of-Payments, and ECB asset-purchase tallies — **so that** I can make positioning decisions from the same signal set institutions use, in one app, without juggling Quiver/Whalewisdom/Unusual-Whales/FRED tabs.
- Captured: 2026-06-07
- Notes: SWOT Tier-1 opportunity — alt-data is the moat. Compounds existing "Politicians + Smart $ + Macro" story. Ship as a phased program, **one feed per PR**, each a 1–2 endpoint addition behind the existing plan-gating system. Default plan placement: free preview (top-3 rows) → **Pro+** (full table, daily) → **Insight+** (rolling windows, alerts, CSV).

  **Phase 1 — Smart $ tab depth (extends `investing_screen.dart` Smart $ sub-tab):**
  - **(A) SEC Form 4 rolling insider windows.** New endpoint `GET /api/insider/form4?window=30d|90d|180d&minBuys=3` → `{ clusters: [{ ticker, name, buyCount, sellCount, netUsd, latestFilingDate, insiders: [{ name, role, shares, value, date }] }], lastUpdated }`. Source: SEC EDGAR full-text-search (free) for `type=4`, parse XML. Cache 6h. Cluster detection: ≥3 distinct insiders buying within window. Already half-touched in current insider endpoint — extend, don't replace.
  - **(B) Short-interest changes.** New endpoint `GET /api/short-interest?window=biweekly` → `{ items: [{ ticker, shortPctFloat, daysToCover, changeVsPriorReport, reportDate }], lastUpdated }`. Source: FINRA short-interest reports (free, biweekly). Cache until next FINRA release. UI: new card in Smart $ with sort by `changeVsPriorReport` desc.

  **Phase 2 — Institutional flows tab (new sub-tab inside Investing, between Smart $ and House Trades):**
  - **(C) 13F position deltas.** New endpoint `GET /api/institutional/13f?fund=BRK|BX|RENAISSANCE|BRIDGEWATER|PERSHING|...&quarter=latest|prior` and `GET /api/institutional/13f/movers?action=new|added|reduced|exited&minUsd=10M` → ticker-level deltas across the 50 most-watched funds. Source: SEC EDGAR 13F filings (free, ~45-day lag is unavoidable and must be disclosed in UI). Cache 24h. New `InstitutionalFlowsTab` widget renders fund cards + ticker leaderboard. Disclose the lag prominently — this is a regulatory artifact, not a bug, but users will complain otherwise.
  - **(D) ETF creation/redemption flows.** New endpoint `GET /api/etf-flows?window=1d|5d|30d&category=equity|bond|commodity|crypto` → `{ items: [{ ticker, name, flowUsd, aum, flowPctAum, category }], lastUpdated }`. Source: ETF.com data scrape or paid Trackinsight tier (decide in tech spike). Cache 6h. UI: bar chart of top inflows/outflows + sortable table.

  **Phase 3 — Options & derivatives (new sub-tab inside Trading, or extends Power Moves):**
  - **(E) Options unusual activity.** New endpoint `GET /api/options/unusual?window=1d&minPremium=100k` → `{ items: [{ ticker, type: call|put, strike, expiry, volume, openInterest, volOiRatio, premium, side: bullish|bearish, ts }], lastUpdated }`. Source: Cboe `delayedquote.com` (free 15-min delayed) or paid Unusual Whales API (decide on cost vs. real-time value). Cache 15m on free source, 30s on paid. Surface alerts (Pro+ via `push_notifications`) when a sweep > $1M premium hits a watchlist ticker.

  **Phase 4 — Macro flow-of-funds (extends `MacroScreen`, new "Flows" sub-tab):**
  - **(F) Fed Z.1 flow-of-funds.** New endpoint `GET /api/macro/z1?series=households|corporates|government|rowOfWorld&window=8q` → quarterly net acquisition of financial assets by sector. Source: FRED API series (free, requires `FRED_API_KEY`). Cache 24h. Chart: stacked area by sector for the last 8 quarters.
  - **(G) US Balance-of-Payments.** New endpoint `GET /api/macro/bop?window=8q` → `{ currentAccount, capitalAccount, financialAccount, lastUpdated }`. Source: BEA API (free, requires `BEA_API_KEY`). Cache 24h.
  - **(H) ECB asset purchases.** New endpoint `GET /api/macro/ecb-app?window=12m` → monthly APP + PEPP holdings + net purchases. Source: ECB Statistical Data Warehouse (free, no key). Cache 24h.

  **Cross-cutting requirements:**
  - All eight feeds reuse the existing `providers/` pattern — each gets a typed provider module under `server/providers/<feed>.ts` returning `{ data, fetchedAt, sourceUrl }`. Routes are thin.
  - **Freshness is non-negotiable:** every endpoint returns `lastUpdated` (ISO timestamp) and `sourceUrl` (link to primary source). UI shows `FreshnessBar` on every new card; if `now - lastUpdated > 2 × cacheTTL` show a yellow warning chip (per US-007 staleness pattern).
  - **Disclose lag** explicitly per feed (13F: ~45 days; Form 4: T+2; FINRA short interest: biweekly; FRED Z.1: ~quarterly with 2-month lag). Methodology bottom sheet per feed.
  - **Plan gates** (add to `plan-enforcement.ts` and `EntitlementService`):
    - `insider_clusters` → Pro+ (full window; Free sees top 3)
    - `short_interest` → Pro+
    - `inst_13f` → Pro+ (full fund list; Free sees 5 marquee funds)
    - `etf_flows` → Pro+
    - `options_ua` → Insight+ (real-time + alerts) / Pro+ (delayed)
    - `macro_flows` → Pro+ (Z.1, BoP, ECB combined)
  - **API keys / env vars:** `FRED_API_KEY` (free signup), `BEA_API_KEY` (free signup), `UNUSUAL_WHALES_API_KEY` (paid, optional fallback to Cboe delayed), `TRACKINSIGHT_API_KEY` (paid, optional). All optional — feeds degrade gracefully (return cached or empty + sourced status) when missing, consistent with existing app behavior.
  - **Caching strategy:** reuse Upstash Redis (already wired for OGE) with feed-specific TTLs. Single-machine in-memory fallback when Redis absent (dev mode).
  - **No new Flutter tab without a backend endpoint live and curl-verified** (per `feedback_server_verification`). Build server-first per phase.
  - **Files refactor coupling:** Phase 2 and Phase 4 add new sub-tabs to `investing_screen.dart` and `volatility_screen.dart` respectively — coordinate with US-008 (giant-file split) so the new tabs land as per-tab files from day one, not as additions to the mega-screens.
  - **Acceptance per feed:** (1) endpoint returns shape documented in CLAUDE.md; (2) `lastUpdated` populated and < documented max-staleness; (3) plan gate fires correct 403 on Free; (4) UI renders in light + dark with FreshnessBar; (5) source disclosed and linkable; (6) graceful empty-state when upstream is down; (7) CLAUDE.md API table updated.
  - **Telemetry:** counter `alt_data.fetch.success{feed}` / `alt_data.fetch.fail{feed}`; warn on > 10% fail rate per hour per feed.
  - **Rollout order recommendation** (highest impact / lowest cost first):
    1. Short Interest (B) — small, biweekly, single FINRA endpoint, instant Smart $ depth.
    2. Form 4 insider clusters (A) — extends existing insider feature, free SEC data.
    3. ETF flows (D) — visible, easy to grok, drives daily app opens.
    4. 13F deltas (C) — heavy data volume but huge differentiator; ship behind a freshness banner.
    5. Z.1 + BoP + ECB (F/G/H) — bundle as one "Macro Flows" tab since they share Insight-level audience.
    6. Options UA (E) — last because of cost / data-licensing decision; do a real spike before committing.
  - **Estimate:** ~3–5 dev-days per feed (server + UI + tests + docs). Full program ~6–8 weeks of focused work. Each feed is independently shippable and gated.
  - **Non-goals:** real-time tick-level options data (out of cost scope); 13F backfill > 8 quarters (out of UX scope); foreign-jurisdiction insider filings (out of regulatory scope this round — UK PDMR / EU MAR are a follow-up `[[intl-insider-feeds]]`).

### US-010 — Localized macro hubs: Asia + Europe data parity with US
**As an** investor in India / Japan / HK / China / UK / Eurozone (and a global macro user) **I want** Monysa's Macro, Markets, and Trading screens to surface region-native data — local central-bank rates, inflation, F&O positioning, bond yields, currency, and sector flows — at the same depth as the US coverage **so that** the "global financial intelligence" pitch holds outside the US and I don't switch to a local app for my home market.
- Captured: 2026-06-07
- Notes: SWOT-identified weakness. Today: India has NSE/BSE stock tabs (decent), but Japan/HK/China/Euronext are essentially multibagger-screener feeds. No JGB/JST/CNH/HIBOR rate cards, no MCX/F&O OI, no local central-bank trackers, no regional CFTC analogues. The Macro screen is implicitly US-centric (VIX, US yield curve, US debt, US sectors, FOMC calendar). International users hit a credibility wall on day 2.

  **Architectural pillar — region selector:**
  - Add a `Region` enum + `regionProvider` (Riverpod, persisted via SharedPreferences) with values: `US (default) | India | UK | EU | Japan | HK | China | Global`.
  - New `RegionToggle` widget — pill in AppBar actions next to `ThemeToggleButton` on Markets / Macro / Trading screens. Profile screen gets a "Home market" setting that sets the default region for new sessions.
  - Region changes the **default** data displayed; "Global" mode (or explicit chips) lets users see all regions side-by-side where it makes sense (e.g. central-bank rates already do this).
  - Backend endpoints accept `?region=` consistently; data shapes stay parallel across regions so the UI is one widget per card, not per region.

  **Phase 1 — India (highest existing audience, cleanest data):**
  - **(A) RBI policy + rates.** Extend `/api/central-bank-rates` to include RBI repo, reverse repo, SDF, MSF, CRR, SLR with last-change date. Source: RBI press releases (scrape) or Trading Economics API. Cache 6h.
  - **(B) Indian yield curve.** New `/api/bonds/in` returning 3M / 1Y / 5Y / 10Y / 30Y G-Sec yields + spread + curve status (matches US `/api/bonds` shape). Source: CCIL / RBI / Worldgovernmentbonds.com. Cache 30m. New card in Macro Dashboard when region=India.
  - **(C) India CPI + IIP + GST collections.** New `/api/macro/in/indicators` → `{ cpi: { yoy, mom, asOf }, iip: {...}, gst: {...}, lastUpdated }`. Source: MoSPI + GST portal. Monthly cadence; cache 24h.
  - **(D) F&O / NSE positioning.** New `/api/positioning/in/fno?segment=index|stock` → top open-interest builders/unwinders, PCR, FII/DII cash + F&O flow. Source: NSE F&O bhavcopy (free, T+1). Daily cache. UI: new "Positioning" card in Trading Dashboard when region=India — the local CFTC analogue.
  - **(E) MCX commodities.** Extend `/api/futures/commodities` to include MCX gold/silver/crude/natgas in INR (alongside USD). Source: MCX bhavcopy or Yahoo `*.MCX` symbols. New chip group in Markets → Commodities.
  - **(F) India economic calendar.** Local events (RBI MPC, CPI release, GST collection, F&O expiry, Budget). Folds into the live calendar from US-007.

  **Phase 2 — Japan:**
  - **(G) BoJ rates + YCC band.** Add BoJ policy rate, YCC 10Y JGB target band (when applicable), JGB purchase pace. Extend `/api/central-bank-rates`. Source: BoJ statistics. Cache 6h.
  - **(H) JGB yield curve.** New `/api/bonds/jp` mirroring US shape: 2Y / 5Y / 10Y / 20Y / 30Y / 40Y JGB yields + spread + curve status. Source: MoF auction data or Worldgovernmentbonds.com. Cache 30m.
  - **(I) Japan CPI + Tankan + Reuters BoJ Tankan-equivalent.** New `/api/macro/jp/indicators`. Source: Statistics Bureau of Japan. Monthly cache.
  - **(J) TOPIX sector heatmap.** Add `topix` as a new index to `/api/heatmap/treemap`. Constituents: hardcode top 100 by weight; reuse the existing currency-normalization work from US-005 so JPY caps render in USD primary.

  **Phase 3 — Hong Kong + China:**
  - **(K) HIBOR + LPR.** New `/api/rates/cn-hk` → HKD HIBOR (1M/3M/12M), CNY LPR (1Y/5Y), PBoC OMO rate, SHIBOR (1W/3M). Source: HKMA, PBoC. Cache 6h.
  - **(L) Northbound / Southbound Stock Connect flows.** New `/api/positioning/cn/stock-connect` → daily Northbound (HK → Shanghai/Shenzhen) and Southbound (Shanghai/Shenzhen → HK) net flow. Source: HKEX free daily reports. Cache 24h. This is the China equivalent of "smart $" — institutionally meaningful.
  - **(M) China credit impulse + PMI.** New `/api/macro/cn/indicators` → NBS PMI, Caixin PMI, total social financing growth (credit impulse), M2. Source: NBS / Caixin / PBoC. Monthly cache 24h.
  - **(N) Hang Seng + CSI 300 treemap.** Add `hsi` and `csi300` to `/api/heatmap/treemap`. Currency normalization (HKD, CNY → USD) via US-005.

  **Phase 4 — Europe (UK + Eurozone):**
  - **(O) BoE + ECB rates.** Extend `/api/central-bank-rates` to include BoE Bank Rate, ECB MRO / DFR / MLF, ECB APP+PEPP holdings (overlap with US-009 H).
  - **(P) Gilt + Bund + OAT yield curves.** New `/api/bonds/uk` and `/api/bonds/eu?country=de|fr|it|es` mirroring US shape. Spread cards: 10Y BTP–Bund (Italy stress proxy), 10Y OAT–Bund (France stress proxy).
  - **(Q) UK + EU CPI / PMI.** New `/api/macro/uk/indicators` and `/api/macro/eu/indicators`. Source: ONS, Eurostat. Monthly cache.
  - **(R) CFTC EUR/GBP/JPY/AUD COT positions.** Extend the existing `/api/futures/cot-metals` pattern to currencies — `/api/futures/cot-fx`. Source: CFTC. Weekly cache. UI: COT positioning card in Markets → Forex.

  **Cross-cutting requirements:**
  - **Shape parity is mandatory.** All region-X equivalents return the *same JSON shape* as the US equivalent so the Flutter card widget is region-agnostic. Diverging shapes per region defeats the entire effort.
  - **Currency display.** All non-USD values shown in native currency by default with USD secondary (reuse US-005 FX plumbing). Bond yields stay in basis points / % (no FX needed). Sector flows and stock-connect flows shown in native currency.
  - **Region-aware Macro screen.** `MacroScreen` (in `volatility_screen.dart`) reads `regionProvider`; cards re-render per region. "Global" mode shows a comparison row across regions for headline cards (policy rate, 10Y yield, CPI, PMI) — high-density macro dashboard.
  - **Region-aware Markets Heatmap.** Index chips already exist (S&P 500 / NASDAQ / DJI / FTSE / Nifty). This story adds TOPIX, HSI, CSI 300, DAX, CAC 40, AEX, SMI under EU/Asia regions. Constituents bundled in `server/data/index_constituents.ts`.
  - **Region-aware economic calendar.** Filters events by region from the US-007 live calendar endpoint.
  - **Plan gating.** Phase 1 (India) lands as **Free** to drive the India audience (largest non-US growth lever). Phase 2–4 deeper feeds (positioning, COT-FX, credit impulse, stock-connect, treemaps for HSI/CSI/TOPIX/DAX) gate at **Pro+** under a new `global_macro_depth` rule.
  - **Localization-light.** No full i18n in this story — UI strings stay in English. Currency symbols and units render correctly per region. Full i18n is a follow-up `[[i18n-localization]]`.
  - **Onboarding integration.** Update `onboarding_screen.dart` to ask "Home market?" with region chips; that sets `regionProvider` for first launch. Aligns with the SWOT "onboarding personalization" opportunity.
  - **File structure.** Each region's macro indicators get their own provider module: `server/providers/macro/in.ts`, `jp.ts`, `cn.ts`, `uk.ts`, `eu.ts`. Routes stay thin per region. Couple with US-008 (giant-file split) — new tabs should land as per-tab files, not additions to the mega-screens.
  - **API keys / env vars (all optional, graceful degradation):** `TRADING_ECONOMICS_API_KEY` (covers many of the macro indicators in one), `RBI_API_KEY` (free), `HKEX_API_KEY` (if available), `EUROSTAT_API_KEY` (free). When keys are absent, fall back to scraped public CSV/PDF where ToS permits, else return empty + `sourceUnavailable: true` flag for the UI.
  - **Caching.** Reuse Upstash Redis (already wired). Local in-memory fallback in dev. TTL per data class: rates 6h, yield curves 30m, monthly macro 24h, positioning data daily.
  - **Freshness discipline (per US-007).** Every region card surfaces `FreshnessBar` with last-updated and source link. Yellow warning chip when stale beyond expected cadence.
  - **Telemetry.** Counter `region.view{region}` to validate which regions actually drive engagement before deepening further. Counter `alt_data.fetch.fail{feed,region}` for upstream reliability.

  **Acceptance per phase:**
  1. New endpoints documented in CLAUDE.md API table with response shapes.
  2. `?region=` query param honored consistently; shape parity verified by snapshot test against US analogue.
  3. Plan gate fires correct 403 on Free for Pro+-gated regional feeds.
  4. UI cards render in light + dark, with native + USD currency where applicable.
  5. FreshnessBar + source link present on every new card.
  6. Region toggle in AppBar persists across app restart.
  7. `onboarding_screen.dart` "Home market" step routes to the right default region.
  8. CLAUDE.md "Screen Reference" updated with regional behavior; new pitfalls added (e.g. *"JGB yields are reported in % not bps — don't apply the US bps formatter"*).

  **Rollout order** (highest impact / lowest cost first):
  1. **Phase 1 (India)** — largest non-US growth segment; cleanest free data sources; multibagger feature already exists. **2–3 weeks.**
  2. **Phase 2 (Japan)** — BoJ pivot narrative is a hot macro topic; JGB curve + YCC is highly differentiated content. **2 weeks.**
  3. **Phase 3 (HK + China)** — stock-connect flows are uniquely valuable; data sourcing is the riskiest. **2–3 weeks.**
  4. **Phase 4 (UK + Eurozone)** — most overlap with existing US patterns (curves, ETFs); fastest to ship after the region-toggle scaffold exists. **1–2 weeks.**

  **Estimate:** ~8–10 weeks of focused work for the full program. Region-toggle scaffold + Phase 1 (India) is ~3 weeks and shippable independently; each subsequent phase is independently shippable behind the same scaffold.

  **Non-goals:** real-time L1 quotes from local exchanges (regulatory + licensing scope); full localization / RTL / language packs (separate `[[i18n-localization]]`); Latin America / Middle East / Africa regions (separate `[[em-macro-hubs]]` after the current 4 regions land); local broker integration / order-routing (separate `[[brokerage-deep-links]]`).

### US-011 — Crypto-native expansion: on-chain flows, ETF flows, stablecoin supply, perp funding, whale wallets
**As a** crypto-curious or crypto-native investor **I want** Monysa to treat crypto as a first-class macro asset class — surfacing the on-chain signals that actually move price (spot ETF flows, stablecoin supply, perp funding rates, whale-wallet activity, exchange netflows) and using the existing Finnhub WebSocket for sub-second prices — **so that** I get a cohesive "Smart $ for crypto" experience without leaving the app for Glassnode / CoinGlass / Arkham / SoSoValue.
- Captured: 2026-06-07
- Notes: SWOT-identified Tier-2 opportunity. Today: `FINNHUB_API_KEY` is wired (`server/trading.ts:490`) and subscribes to BINANCE BTC/ETH/BNB/SOL/XRP at `server/trading.ts:495`, but the sub-second stream is mostly unused beyond the quotes endpoint. Crypto in the Markets/Trading screens shows up as just another row in the "Crypto" category chip — no dedicated screen, no on-chain depth. This is a wasted asset given the WS plumbing already exists.

  **Architectural pillar — new Crypto screen + on-chain provider layer:**
  - **New top-level screen `CryptoScreen` at route `/crypto`** — added as a 6th bottom-nav tab *OR* (lower-risk) tucked under the existing Trading screen as a new sub-tab "Crypto" (decide in tech-design spike based on nav real estate; recommend sub-tab first, promote to top-level once usage data justifies it).
  - **`server/providers/onchain/<source>.ts` modules** — one provider per data source, returning typed `{ data, fetchedAt, sourceUrl }`. Routes stay thin.
  - **Finnhub WS becomes a real-time fan-out**, not just a quote cache: a server-side `cryptoTickerHub` broadcasts deltas via SSE (`GET /api/crypto/stream`) so the Flutter app can patch in-place rather than poll. Pro+-gated via new `crypto_realtime` rule. Falls back to 5s polling on Free.

  **Phase 1 — ETF flows & stablecoin supply (highest signal-to-noise, free data):**
  - **(A) Spot Bitcoin & Ethereum ETF flows.** New endpoint `GET /api/crypto/etf-flows?asset=btc|eth&window=1d|5d|30d` → `{ items: [{ ticker, name, flowUsd, aum, flowPctAum, holdings, premium }], total: { netFlowUsd, cumulativeNetFlow }, lastUpdated }`. Source: SoSoValue free tier or scrape Farside Investors (BTC ETFs) + ETC Group (ETH ETFs). Daily cache after 5pm ET. Tickers: IBIT, FBTC, GBTC, ARKB, BITB, HODL, BRRR, BTCO, EZBC, BTCW (BTC) + ETHA, ETHE, ETHV, ETH, FETH, EZET, QETH (ETH). **This is the single highest-signal crypto feed of 2024–2026** — institutional flow is the dominant marginal buyer.
  - **(B) Stablecoin supply & netflows.** New endpoint `GET /api/crypto/stablecoins?window=7d|30d|90d` → `{ items: [{ symbol: USDT|USDC|DAI|FDUSD|USDe|PYUSD, supplyUsd, change7d, change30d, chain: { ethereum, tron, solana, ... } }], total: { aggregateSupplyUsd, netChange7d }, lastUpdated }`. Source: DefiLlama free API (preferred — clean), CoinGecko as fallback. Cache 1h. **Stablecoin supply growth is the cleanest leading indicator of crypto bid available** — surface aggregate + per-issuer + per-chain breakdown.
  - **(C) Exchange netflows (BTC + ETH).** New endpoint `GET /api/crypto/exchange-netflows?asset=btc|eth&window=1d|7d|30d` → daily net coins moved to/from CEX wallets. Source: CryptoQuant free tier or Glassnode Studio scrape (check ToS). Negative netflows = supply moving to self-custody (bullish); positive = supply pre-positioning to sell (bearish). Daily cache.

  **Phase 2 — Derivatives positioning (CoinGlass-equivalent in-app):**
  - **(D) Perp funding rates.** New endpoint `GET /api/crypto/funding?asset=btc|eth|sol|...&exchanges=binance|bybit|okx|hyperliquid` → `{ items: [{ exchange, fundingRate, fundingRate8hAnnualized, nextFundingTs, openInterestUsd }], aggregate: { avgFundingAnnualized, oiTotalUsd, oiChange24h }, lastUpdated }`. Source: each exchange's public REST API directly (free, well-documented). Cache 1m. Reuse Finnhub WS pattern for OI deltas where exchange streams allow.
  - **(E) Long/short ratio + liquidations heatmap.** New endpoint `GET /api/crypto/liquidations?asset=btc|eth&window=1h|24h|7d` → aggregated liquidation USD volume + price levels of dense liq clusters (for the "liquidation magnet" chart). Source: CoinGlass free tier (check API key + ToS) or aggregate from exchange public liq feeds.
  - **(F) Options open interest (Deribit).** New endpoint `GET /api/crypto/options?asset=btc|eth` → max-pain strike, put/call ratio, 25-delta skew, OI by strike, IV term structure. Source: Deribit public REST (free). Cache 5m. This is the crypto analogue of options UA (US-009 E).

  **Phase 3 — On-chain whales & wallets:**
  - **(G) Large transaction monitor.** New endpoint `GET /api/crypto/whale-txns?asset=btc|eth|stable&minUsd=1M&window=24h` → `{ items: [{ ts, asset, amountUsd, from, to, fromLabel, toLabel, txHash, chain }], lastUpdated }`. Source: Whale Alert public feed (X/Twitter scrape or paid tier) *or* directly query Etherscan + Bitcoin RPC + Solscan with a value filter + Arkham Intel free tier for wallet labels. Cache 5m. UI: live-updating timeline card; click row → block explorer.
  - **(H) Known-entity wallet tracking.** Curated list of marquee wallets (BlackRock IBIT custody, MicroStrategy, Tether reserves, Binance cold wallets, US gov BTC stash, FTX/Mt-Gox creditors) with balance + 24h delta. New endpoint `GET /api/crypto/entity-wallets` → static curated list with live balances. Source: chain-native RPCs + Arkham labels. Cache 5m.

  **Phase 4 — Crypto-specific macro / sentiment:**
  - **(I) Funding-rate term structure heatmap.** Derived from (D); a grid of asset × exchange × funding annualized to visualize regime (positive carry vs. shorts paying).
  - **(J) Crypto Fear & Greed Index (existing free).** Source: alternative.me. Add as a small card. Cache 1h. (This is table-stakes; ship as part of dashboard polish.)
  - **(K) Spot vs. perp basis.** Derived from existing Finnhub spot + (D) perp endpoint — the "CME basis trade" indicator institutions watch.
  - **(L) Bitcoin dominance + ETH/BTC ratio.** Tiny derived card from existing CoinGecko or compute from Finnhub.

  **Crypto screen layout (per phase):**
  - **Phase 1 dashboard cards:** ETF Flows hero card (BTC + ETH stacked bar last 30d net flow) → Stablecoin supply card (aggregate + top issuers + 7d change chip) → Exchange netflows mini-chart → Fear & Greed gauge.
  - **Phase 2 dashboard additions:** Funding-rate grid → Liquidations heatmap (24h) → Options skew / max-pain card (BTC + ETH).
  - **Phase 3 dashboard additions:** Whale transactions timeline (live SSE) → Entity wallets balance card.
  - **Sub-tab structure for the Crypto surface (if it stays inside Trading):** *Dashboard* (default) → *Flows* (ETF + stablecoin + netflows) → *Derivatives* (funding + liq + options) → *On-chain* (whales + entities). Coordinate with US-008 (giant-file split) — every tab as its own file from day one.

  **Cross-cutting requirements:**
  - **Shape parity.** All flow endpoints return the same envelope: `{ items, summary?, lastUpdated, sourceUrl }`. Frontend renders via shared card widgets.
  - **Freshness discipline (per US-007).** Every card surfaces `FreshnessBar` + source link. Yellow staleness chip when data exceeds expected cadence. Source disclosure mandatory — crypto users are paranoid about data provenance (rightly so).
  - **Plan gating.** New `EntitlementService` rules:
    - `crypto_etf_flows` → **Free** (acquisition wedge — let everyone see it, it's the marquee feature).
    - `crypto_realtime` → **Pro+** (Finnhub WS fan-out via SSE; Free polls at 5s).
    - `crypto_funding_grid` → **Pro+**.
    - `crypto_whales` → **Pro+** (whale txns + entity wallet tracking; Free sees top-3 of last 24h).
    - `crypto_options` → **Insight+** (Deribit OI + skew; advanced users only).
  - **No new app dependencies.** Reuse existing `ws` library on the server, `webview_flutter` / `fl_chart` on the client. Funding heatmap is a custom widget; reuse `sector_treemap.dart` pattern if applicable.
  - **API keys / env vars (all optional, graceful degradation):**
    - `SOSOVALUE_API_KEY` (free signup) — ETF flows preferred source.
    - `CRYPTOQUANT_API_KEY` (free tier) — exchange netflows.
    - `COINGLASS_API_KEY` (free tier) — liquidations + funding fallback.
    - `ARKHAM_API_KEY` (free tier) — wallet entity labels.
    - `WHALE_ALERT_API_KEY` (paid; optional) — whale alerts; fallback to direct chain queries.
    - When all keys absent, ETF flows + stablecoin supply still work via free public APIs (Farside scrape + DefiLlama) — never go dark on the marquee surface.
  - **Caching strategy.** Reuse Upstash Redis (already wired). TTLs: ETF flows daily; stablecoins 1h; funding 1m; liquidations 5m; whale txns 5m; entity wallets 5m; options 5m.
  - **Finnhub WS upgrade.** Wrap the existing `_finnhubConnected` socket (`server/trading.ts:197`) in a `cryptoTickerHub` event emitter; expose `GET /api/crypto/stream` (Server-Sent Events) that broadcasts tick deltas + funding-rate updates + new whale txns to subscribed clients. Existing `/api/trading/quotes` keeps working unchanged.
  - **Symbol expansion.** Extend `FINNHUB_SYMBOLS` (currently 5: BTC/ETH/BNB/SOL/XRP at `server/trading.ts:495`) to the top-20 by market cap with throttled subscription (Finnhub free tier has connection limits — verify cap before expanding).
  - **Asset Detail integration.** Tapping any crypto row → existing `/asset/:symbol` route. Augment Asset Detail with a 6th sub-tab "On-chain" (visible only for symbols where `category == "Crypto"`): funding rate, OI, exchange netflows, whale activity for that asset.
  - **Watchlist + alerts.** Crypto symbols already work with the existing watchlist (`watchlist_provider.dart`) and alerts (`alert_provider.dart`). Add new alert types: "ETF flow > $X", "Funding rate flips negative", "Whale txn > $Y on watched chain". Plan-gated via existing `push_notifications` + `alerts_unlimited`.
  - **Disclose limitations.** Methodology bottom sheet per card explains the data lag (e.g. ETF flows are T+1 close-of-business; on-chain is real-time but lacks centralized exchange internal moves; perp funding is exchange-specific). Reuse the US-006 methodology pattern.
  - **Telemetry.** Counters: `crypto.view{tab}`, `crypto.stream.connected`, `crypto.fetch.fail{feed}`. Track `crypto.tab.daily_actives` to validate the SWOT thesis that crypto drives engagement before deepening further.

  **Acceptance per phase:**
  1. New endpoints documented in CLAUDE.md API table + response shapes.
  2. `FreshnessBar` + source link on every new card.
  3. Plan gates fire correct 403 on lower tiers.
  4. UI renders in light + dark; tablet/landscape via `MaxWidthLayout`; clears bottom nav per `extendBody` pitfall.
  5. SSE stream survives Finnhub reconnects without dropping subscribers (auto-resubscribe on backend reconnect).
  6. Methodology sheet present and accurate per card.
  7. CLAUDE.md "Screen Reference" updated; new pitfalls added (e.g. *"ETF flow numbers are T+1; live price may have moved 5% since the flow data closed"*).

  **Rollout order** (highest signal / lowest cost first):
  1. **Phase 1 — Flows** (ETF + stablecoin + netflows). Free marquee. **2 weeks.**
  2. **Phase 2 — Derivatives** (funding + liq + options). Pro+ gated. **2 weeks.**
  3. **Phase 3 — On-chain whales/entities**. Pro+ gated. **2 weeks.**
  4. **Phase 4 — Sentiment + derived** (Fear & Greed, basis, dominance). Free polish. **1 week.**
  5. **SSE real-time stream upgrade** can land alongside Phase 1 or 2 — independent infra change.

  **Estimate:** ~6–8 weeks for the full program; Phase 1 alone is ~2 weeks and shippable independently with high acquisition impact.

  **Non-goals:**
  - Real-money trading or wallet custody (out of regulatory scope; a `[[crypto-brokerage-deep-links]]` story handles deep-links to Coinbase / Kraken / Binance).
  - DEX / DeFi TVL / yield aggregators (separate `[[defi-flows]]` story — different audience).
  - NFT / memecoin tracking (separate scope; high noise, low margin-impact).
  - On-chain L1 chain analytics (gas, hashrate, validators) — useful but tier-3; separate `[[chain-health]]` story.
  - Crypto tax tracking / portfolio reconciliation (separate app category).

### US-012 — Politician-trade data licensing audit, usage caps & primary-source fallback
**As the** product owner / on-call engineer **I want** the politician-trade data pipeline (FMP, Quiver, OGE) to be ToS-compliant, attribution-correct, usage-metered, alert-instrumented, and capable of degrading to primary public-source ingestion if a vendor revokes or restricts the license — **so that** scaling subscribers does not silently breach contractual fair-use clauses, expose the company to license-termination / cease-and-desist / chargebacks, or strand a paid feature on a vendor that just turned us off.
- Captured: 2026-06-07
- Notes: SWOT-identified Tier-1 threat. Today the politician-trade surface (`investing_screen.dart` → Presidential / Congress / Smart $ / House Trades tabs) depends on:
  - **FMP** (`FMP_API_KEY` in `.env`) for Senate + House congress trades and the dedicated `GET /api/house-trades` endpoint (`server/routes/quiver.ts`).
  - **Quiver Quantitative** (`QUIVER_API_KEY`) as a secondary fallback for `/api/quiver/congress`.
  - **SEC EDGAR** for `/api/quiver/insider` (free public, low licensing risk).
  - **Senate LDA** for `/api/quiver/lobbying` (free public, low licensing risk).
  - **OGE Form 278-T PDF pipeline** for `/api/oge/trump-transactions` (free public PDF parsing; no vendor — already self-sourced via `server/routes/oge.ts`, including Upstash Redis distributed lock).

  The risk is **not** EDGAR / LDA / OGE — those are already publicly sourced. The risk is **FMP and Quiver**: both have ToS clauses prohibiting derived-data redistribution, paid downstream resale, or unauthorized caching past contracted retention. As Monysa scales paid subscribers, every congress-trade row we serve from cache is potentially a per-record redistribution event under the vendor's reading of their terms — without any internal alerting to tell us we crossed a line.

  **Architectural pillars:**

  1. **Licensing register + ToS audit (the "we know what we agreed to" foundation).**
     - Create `docs/licensing/` (or `LICENSING.md` at repo root if `docs/` doesn't exist yet) with one markdown file per upstream vendor: `fmp.md`, `quiver.md`, `sec-edgar.md`, `senate-lda.md`, `oge.md`, plus future entries from US-009 / US-011 (FRED, BEA, Cboe, SoSoValue, DefiLlama, etc.).
     - Each file documents: tier subscribed → monthly cost → contracted call-rate cap → contracted user-cap (if any) → derived-data clause verbatim → caching limits → attribution requirement → contact email for license disputes → date last reviewed.
     - One-time **legal-review checkpoint** for FMP + Quiver: a human-readable summary of what we are and are not allowed to do, signed-off (initials + date) in the file. Re-review every 6 months — calendar reminder added to whoever owns the repo.

  2. **Usage metering & contractual-cap enforcement (the "we know what we use" runtime).**
     - New server-side `UsageMeter` (in-process counter, persisted hourly to Upstash Redis): every outbound call to a vendor is counted by `{ vendor, endpoint, ts_hour }`. New endpoint `GET /api/admin/usage?vendor=fmp|quiver&window=24h|7d|30d` returns the rolling totals. Bearer-auth gated via a new `ADMIN_TOKEN` env var.
     - Each vendor entry in the licensing register declares `softCap` (warn at 80%) and `hardCap` (refuse outbound at 100%). The meter checks before every call and:
       - 80% of monthly soft cap → emit `vendor.cap.warning{vendor}` and surface in `lastUpdated` metadata + Sentry breadcrumb.
       - 100% of hard cap → short-circuit the upstream call, serve last-good cache, and set `degraded: true` in the API response so the UI can show a yellow FreshnessBar warning.
     - **Per-device fair-use rate-limiting** (separate from per-vendor cap): reuse `express-rate-limit` (already in `package.json`) to cap politician-trade endpoints at e.g. 60 req/device/hour. Prevents a single power-user from burning the FMP quota for everyone.

  3. **Attribution & disclosure (the "we credit our source" UI surface).**
     - Every UI card sourced from FMP / Quiver renders a `"Source: Financial Modeling Prep"` / `"Source: Quiver Quantitative"` footnote (small, `c.textSecondary`) with the source URL linkable. Required by both vendors' ToS, and best-practice for users anyway.
     - Methodology bottom sheet per tab discloses: data source, refresh cadence, vendor lag, and a "We do not redistribute raw vendor data — values shown are derived and time-delayed per our license" disclaimer reviewed by legal.
     - Update `LICENSE` file at repo root with a "Third-party data attribution" section pointing to `docs/licensing/`.

  4. **Caching contracts (the "we don't cache past what we may keep" rule).**
     - Audit existing TTLs for politician endpoints (`/api/quiver/congress`, `/api/quiver/lobbying`, `/api/quiver/insider`, `/api/quiver/congress-trades`, `/api/house-trades` — currently all 4h per CLAUDE.md) against each vendor's permitted retention.
     - For each vendor, the licensing register declares `maxRetentionHours`. Caching code reads from the register, not from a magic number in the route file. A vendor downgrade ("you can no longer cache > 1h") becomes a config change, not a code search.
     - **No persistent storage of raw vendor rows** beyond the documented TTL. Verify by adding a CI grep guard: no `server/data/*.json` files containing FMP/Quiver-shaped rows committed.

  5. **Primary-source fallback path (the "if vendor turns us off, we don't go dark" insurance).**
     - **Congress trades primary source:** Senate ETHICS PFD portal + House Clerk PTR portal both publish PDF disclosures publicly. Build `server/providers/politician/senate-pfd.ts` and `house-ptr.ts` that scrape + parse the public PDFs *or* ingest the official structured XML/JSON where it exists (House publishes a JSON feed of PTR filings; verify before assuming).
     - **OGE Form 278-T** is already self-sourced — keep as the gold-standard reference for what a vendor-free pipeline looks like (PDF parse + Upstash distributed lock per `server/routes/oge.ts`).
     - **Wiring:** the existing provider registry (`server/providers/`) gains a new "tier" concept. Each politician feed has an ordered chain `[fmp, quiver, primary-source, snapshot]`. Routes call `getCongressTrades({ chain })` and use the first source that returns non-empty + ToS-compliant data. Vendor disable becomes an env-flag flip: `DISABLE_FMP=true` and the chain skips FMP automatically.
     - **Quality parity:** primary-source data is canonical but **slower to update** (FMP normalizes within hours of disclosure; PDF pipelines can be 24h+ behind). Disclose the freshness penalty in the UI when the chain falls back.

  6. **Vendor health monitoring & kill-switch.**
     - Daily probe (cron at 09:00 UTC) hits each vendor's `/health` or a known low-cost endpoint. Records latency + error rate to a `vendor_health` Redis key.
     - If vendor returns 401/403/404 spike (likely revocation or ToS-violation lockout) → automatic kill-switch flips `DISABLE_<VENDOR>=true`, falls back to next source in the chain, emits `vendor.killswitch.tripped{vendor}` to Sentry + (if configured) a webhook to a Slack/email channel.
     - Admin endpoint `POST /api/admin/vendor/disable?vendor=fmp` for manual kill — gated by `ADMIN_TOKEN`. Useful when legal sends a "cease using our data" letter before a 401 fires.

  7. **Subscriber-scale safety check.**
     - At 1k / 5k / 10k paid subs we recompute projected monthly vendor calls vs. cap; the licensing register file gets a "subscriber threshold" table. The 80% soft-cap warning naturally flags real-world breaches; this is the deliberate-planning side.
     - When approaching FMP's typical per-month cap (varies by tier), pre-emptively shift more traffic to cache + reduce refresh cadence (e.g. politician endpoints from 4h → 12h TTL during peak demand). Tunable from the licensing register, not code.

  **Cross-cutting requirements:**
  - **No new third-party deps.** Use existing `express-rate-limit`, Upstash Redis, Sentry, `zod` for validation.
  - **No user-facing behavior change in the happy path.** Users on Pro/Insight see the same data with a small "Source" footnote added. Only degraded states (cap hit, vendor down, primary fallback active) change behavior — and that change is a yellow FreshnessBar + methodology disclosure.
  - **CLAUDE.md updates:** new section "Data licensing & vendor governance" linking to `docs/licensing/`; new env vars documented (`ADMIN_TOKEN`, `DISABLE_FMP`, `DISABLE_QUIVER`, `VENDOR_HEALTH_WEBHOOK_URL`); new pitfall: *"Politician-trade endpoint TTLs are controlled by `docs/licensing/<vendor>.md` — do not hardcode `4 * 60 * 60` in `server/routes/quiver.ts` without updating the license register first."*
  - **Telemetry:** counters `vendor.call.success{vendor,endpoint}`, `vendor.call.fail{vendor,endpoint,status}`, `vendor.cap.warning{vendor}`, `vendor.killswitch.tripped{vendor}`, `vendor.fallback.used{from,to}`. Surfaceable via `GET /api/admin/usage` for ad-hoc checks.
  - **Tests:**
    - Unit: `UsageMeter` hard cap rejects the 101st call within the window; soft cap emits warning at 80.
    - Unit: chain selector skips disabled vendor and uses the next.
    - Unit: kill-switch trips on 3 consecutive 401s; resets on manual `/api/admin/vendor/enable`.
    - Integration: `curl /api/quiver/congress` with `DISABLE_FMP=true` returns Quiver data with `source: "quiver"`; with both `DISABLE_FMP=true` and `DISABLE_QUIVER=true` returns primary-source data with `source: "primary"` and `degraded: true`.
    - Manual: methodology sheets and Source footnotes render in light + dark on all four investing sub-tabs that consume politician data.

  **Acceptance:**
  1. `docs/licensing/{fmp,quiver,sec-edgar,senate-lda,oge}.md` exist with signed-off ToS summary + retention + cap fields.
  2. Every politician-trade card surfaces a `Source: <vendor>` footnote with linkable URL.
  3. `UsageMeter` is wired and `GET /api/admin/usage` returns real counters (auth-gated).
  4. Vendor health daily probe runs; kill-switch trips on 401/403 spike.
  5. Primary-source fallback (`server/providers/politician/senate-pfd.ts` + `house-ptr.ts`) returns non-empty data on at least the most recent 30 days for both chambers — verified by curl.
  6. CI grep guard prevents committing FMP/Quiver-shaped raw payloads to the repo.
  7. CLAUDE.md updated.
  8. Calendar reminder set: re-review FMP + Quiver ToS at 6-month interval.

  **Rollout order** (lowest-risk / fastest-credit first):
  1. **Licensing register + attribution UI footnotes** (1–2 days; pure-documentation + small UI). Buys legal cover immediately even if nothing else lands.
  2. **UsageMeter + admin endpoint + soft-cap warnings** (2–3 days).
  3. **Hard-cap enforcement + per-device rate-limit** (1–2 days).
  4. **Vendor health probe + auto kill-switch** (2 days).
  5. **Primary-source fallback providers** (4–6 days — the heaviest piece; PDF parsing is the OGE pattern but per-chamber).
  6. **Chain wiring + env-flag plumbing** (1–2 days).

  **Estimate:** ~2–3 weeks of focused work end-to-end; the first 3 steps (~1 week) cover the highest-severity legal exposure and can ship independently.

  **Non-goals:**
  - Becoming a data vendor ourselves / reselling politician-trade data via API (`api_access` Insight gate stays scoped to *Monysa-derived analytics*, not raw vendor pass-through — explicitly).
  - Litigation or contract renegotiation with FMP/Quiver (out of scope — this story makes us defensible if it happens, not preemptive on the legal side).
  - General per-route auth/authz overhaul (the `ADMIN_TOKEN` here is the minimal bearer needed for the admin endpoints; a full RBAC system is `[[admin-rbac]]`).
  - Backfilling the existing snapshot store (`server/data/`) under the new retention rules — purge what's stale, document what stays. A separate `[[data-retention-purge]]` story can audit non-politician feeds (heatmap constituents, central-bank rates, crisis playbook) for the same compliance bar.

### US-013 — LLM cost governance: per-device quotas, budget caps, prompt caching, model tiering
**As the** product owner / on-call engineer **I want** every Anthropic / OpenAI call originating from Monysa to be metered per device, capped against a monthly budget, served from a deterministic prompt cache wherever possible, and tiered to the cheapest model that still meets quality bars — **so that** a power user (or a script abusing a stolen device-ID) cannot dent unit economics, and so that LLM spend grows predictably with Insight subscriber count, not unboundedly with usage intensity.
- Captured: 2026-06-07
- Notes: SWOT-identified Tier-1 threat. Today the LLM surface is:
  - **Anthropic (`claude-haiku-4-5-20251001`)** for tariff exposure analysis at [server/routes/exposure.ts:37-38](server/routes/exposure.ts#L37-L38) (24h cache, Insight+ gated).
  - **Anthropic (`claude-haiku-4-5`)** for the AI analyst note at [server/trading.ts:2658-2659](server/trading.ts#L2658-L2659) (Pro+ gated).
  - **OpenAI (`gpt-4o-mini`)** for the volatility briefing at [server/routes/volatility.ts:168-169](server/routes/volatility.ts#L168-L169) (30m cache, Pro+ gated).
  - **OpenAI (`gpt-4o-mini`)** for a second briefing path at [server/routes/volatility.ts:250-251](server/routes/volatility.ts#L250-L251).

  Each LLM call is plan-gated but **not budget-gated**. There is no per-device counter, no monthly cap, no caching of cache-hot identical inputs, no prompt-caching headers, no per-vendor month-to-date spend tracker, no kill-switch. A Pro user could trigger the analyst note for 49 assets × N strategies × every page load and quietly burn $X/month in Anthropic spend. An Insight user could trigger exposure analysis repeatedly via `?bust=1`-style cache busting if it exists. There is no model-tiering: every call uses the same model whether the task warrants it or not.

  **Architectural pillars:**

  1. **Per-device LLM quotas (the "no single user dents margins" rule).**
     - New `LlmQuota` service backed by Upstash Redis (already wired). Keyed `quota:llm:{device_id}:{vendor}:{yyyymm}`. Increments on every call; reads counter before every call.
     - Quotas live in a new `server/llm/quotas.ts` config, derived from plan:
       - **Free:** 0 LLM calls (existing plan gates already block; no change).
       - **Pro:** 30 analyst-notes/month, 10 volatility-briefings/month.
       - **Insight:** 100 analyst-notes, 60 briefings, 30 exposure-analyses/month.
       - **Enterprise:** soft 10× Insight; alert ops at 50% / 80%, never hard-block.
     - Quota exceeded → endpoint returns `429 { error, code: "LLM_QUOTA_EXCEEDED", resetAt, used, limit }`. UI shows a calm "You've used N/M monthly AI calls — resets on YYYY-MM-DD" rather than failing silently.
     - **Per-device daily burst cap**: 1/3 of the monthly limit per 24h to prevent a single bad day blowing the budget.
     - **Per-IP secondary cap** via `express-rate-limit` (already in `package.json`) — defense against device-ID rotation by a malicious actor.

  2. **Global monthly LLM budget cap (the "we know what we'll spend" envelope).**
     - New `LlmBudget` config in env (`LLM_BUDGET_USD_ANTHROPIC=500`, `LLM_BUDGET_USD_OPENAI=200`) with month-to-date spend tracker in Redis: `spend:llm:{vendor}:{yyyymm}`.
     - Every successful call records estimated cost: `inputTokens × inputPricePerToken + outputTokens × outputPricePerToken`. Token prices live in `server/llm/pricing.ts` (one source of truth, updated when models reprice).
     - Soft alarm at 80% of monthly budget → Sentry warning + (if configured) webhook to `LLM_BUDGET_WEBHOOK_URL`.
     - Hard cap at 100% → flip a circuit breaker; calls return cached response if available, else `503 { error, code: "LLM_BUDGET_REACHED", retryAt: <first-of-next-month> }`. UI shows a banner: "AI features are temporarily resting — back on YYYY-MM-DD."
     - Admin endpoint `GET /api/admin/llm/spend?window=mtd|7d|30d` returns spend by vendor + by endpoint + by plan. Bearer-auth via `ADMIN_TOKEN` (shared with US-012 pattern).

  3. **Prompt caching & deterministic cache keys (the "stop paying twice for the same answer" layer).**
     - **Anthropic prompt caching:** add `cache_control: { type: "ephemeral" }` to the static system-prompt block in [exposure.ts](server/routes/exposure.ts) and [trading.ts](server/trading.ts) analyst-note prompts. The 5-minute TTL of Anthropic's cache covers the request burst window perfectly. Anthropic charges 90% less on cache hits — drop-in cost reduction.
     - **Deterministic response cache (per-input, not per-user):** key = `sha256(model + system_prompt + user_input + tool_set)`. Stored in Redis with TTL = the existing endpoint cache TTL (24h exposure, 30m briefing, 24h analyst-note). Today these endpoints have route-level caching but the cache key includes the request, not the prompt content — a small wording variation in the request reissues an identical LLM call. Switch to content-hash keys.
     - **Negative caching:** if a call fails with a non-retriable error (e.g. content-policy refusal), cache the failure for 1 hour so we don't burn tokens retrying.
     - **No-op short-circuit:** for the analyst note specifically, if the input symbol's price hasn't moved > 1% AND the news headline hash is unchanged since last successful generation, return the previous note. The note prompt at [server/trading.ts:2658](server/trading.ts#L2658) doesn't need to fire if nothing meaningfully changed.

  4. **Model tiering (the "use the cheapest model that works" discipline).**
     - New `server/llm/models.ts` registry mapping each *task* to a model tier:
       - **`exposure-analysis`** → Claude Haiku 4.5 (current; the right call — complex multi-comp analysis benefits from Haiku-class quality).
       - **`analyst-note`** → Claude Haiku 4.5 (current; consider downgrading the no-news / low-volatility path to a cheaper completion as a follow-up).
       - **`volatility-briefing`** → currently gpt-4o-mini; evaluate Haiku 4.5 vs. gpt-4o-mini head-to-head (both are ~$0.25/1M-in tier). Pick one vendor to reduce surface area.
     - Centralizing the model choice means a vendor-price-change response is one config edit, not five.
     - **Output-token caps per task:** `max_tokens` is currently set in each route; centralize to `models.ts` and tighten where possible — most users don't read past ~200 tokens of an analyst note.

  5. **Observability & feedback loops.**
     - Counters: `llm.call.success{vendor,task,plan}`, `llm.call.fail{vendor,task,status}`, `llm.tokens.input{vendor,task}`, `llm.tokens.output{vendor,task}`, `llm.cost.usd{vendor,task}`, `llm.cache.hit{task,layer:prompt|response}`, `llm.cache.miss{task}`, `llm.quota.blocked{plan}`, `llm.budget.blocked`.
     - Dashboard endpoint `GET /api/admin/llm/dashboard` (auth-gated): MTD spend, top-10 devices by call count, top-10 tasks by token cost, cache-hit rate per task, refund-equivalent savings from caching ("we would have spent $X without caching this month").
     - Cost-attribution by plan: Insight users should drive Insight-tier features' costs; if Pro users somehow trigger Insight-tier costs, the dashboard surfaces it (= gating bug).

  6. **Surface caching status to the UI (the "users don't care, but ops does").**
     - LLM responses include `meta: { cached: boolean, cacheLayer?: "prompt"|"response", generatedAt }`. UI doesn't show this to the user but the Flutter dev menu (Profile → Diagnostics, follow-up) can surface it for QA.
     - When response is from cache, FreshnessBar reflects `generatedAt`, not `now`.

  7. **Abuse mitigation specific to LLMs.**
     - Reject obvious prompt-injection attempts in user-supplied input (the search query that feeds analyst notes, the symbol used for exposure analysis). Strict regex + length cap before the prompt assembly.
     - `?bust=` / `?refresh=` query params (if any exist for LLM endpoints) require `Plan.enterprise`. No other plan gets to bypass cache.

  **Cross-cutting requirements:**
  - **No user-facing happy-path behavior change** — Pro/Insight users see the same AI features. Only quota-hit / budget-hit states differ, and they show graceful messages.
  - **Backwards-compatible plan gates** — `EntitlementService` rules (`exposure_ai`, `analyst_notes_unlimited`) stay as the access gate; quotas + budget are a *second layer* underneath.
  - **No new third-party deps.** Reuse Upstash Redis, `express-rate-limit`, Sentry, `crypto` (already in pubspec/package).
  - **Dev-mode behavior:** when `APP_SIGNING_SECRET` is absent and every device returns `Plan.enterprise` (per CLAUDE.md), quotas should be *generous* but still enforced so dev surfaces dashboard wiring bugs. `DEV_PLAN=insight` exercises Insight quotas.
  - **CLAUDE.md updates:**
    - New section "LLM cost governance" explaining the quota + budget + caching layers.
    - New env vars documented: `LLM_BUDGET_USD_ANTHROPIC`, `LLM_BUDGET_USD_OPENAI`, `LLM_BUDGET_WEBHOOK_URL`, `LLM_QUOTAS_DISABLED` (escape hatch for dev), `ADMIN_TOKEN` (shared with US-012).
    - New pitfall: *"LLM endpoint TTLs and model choices are centralized in `server/llm/`. Do not change a model inline in a route — update the registry so cost telemetry and pricing stay accurate."*
    - New pitfall: *"Cache keys for LLM responses must hash the prompt content, not the request URL. A symbol uppercase/lowercase variant must hit the same cache entry."*
  - **Telemetry preserves user privacy:** spend dashboard aggregates by `device_id`; do not log user-supplied prompt content. Sentry breadcrumbs on LLM calls redact the user-input field.
  - **Tests:**
    - Unit: `LlmQuota.consume()` returns blocked at limit+1; resets at month boundary.
    - Unit: cost calculator returns expected USD given a fixture of (model, input_tokens, output_tokens) per the price table.
    - Unit: content-hash cache key is stable across whitespace + casing variations.
    - Unit: budget circuit breaker trips at threshold; restores on month rollover.
    - Integration: `curl /api/exposure/analysis` × N+1 times for a single device returns 429 at N+1 with documented body shape.
    - Integration: identical exposure analysis input from two different devices in the same month → second call hits response cache, increments cache-hit counter, does **not** debit either device's quota (decision: cache hits don't count against per-device quotas, only LLM-token quotas, to keep UX fair).
    - Integration: prompt-cache hit (Anthropic side) reflected in `meta.cacheLayer = "prompt"` and a measurable cost reduction in the spend tracker.

  **Acceptance:**
  1. Every LLM-calling route ([exposure.ts](server/routes/exposure.ts), [volatility.ts](server/routes/volatility.ts), the analyst-note path in [trading.ts](server/trading.ts)) routes through a single `callLlm(task, input, deviceId, plan)` helper in `server/llm/`.
  2. `LlmQuota` enforces per-device monthly + daily caps; quota-hit returns 429 with `code: "LLM_QUOTA_EXCEEDED"`.
  3. `LlmBudget` enforces global monthly $ cap per vendor; cap-hit returns 503 with `code: "LLM_BUDGET_REACHED"` and serves cached responses when available.
  4. Anthropic prompt-cache enabled on at least the exposure-analysis and analyst-note system prompts; cache-hit rate visible in dashboard.
  5. Content-hash response cache replaces URL-keyed cache for all four LLM endpoints.
  6. `GET /api/admin/llm/spend` and `/api/admin/llm/dashboard` work behind `ADMIN_TOKEN`.
  7. Soft (80%) + hard (100%) alarms emit to Sentry + optional webhook.
  8. CLAUDE.md updated with new section, env vars, and pitfalls.
  9. UI shows a calm quota-exceeded message rather than a generic error toast.
  10. No raw user-prompt content recorded in logs or breadcrumbs.

  **Rollout order** (highest savings / lowest risk first):
  1. **Prompt caching + content-hash response keys** (1–2 days) — instant 30–80% cost reduction with zero user impact. Ship first; ROI before any infra work.
  2. **Spend tracker + admin dashboard** (2 days) — visibility before enforcement. Run for 1 week to validate the price table matches actual invoiced spend.
  3. **Per-device quotas + 429 path** (2–3 days) — the per-power-user cap.
  4. **Global budget cap + 503 circuit breaker** (1–2 days).
  5. **Model registry + max-token tightening** (1–2 days) — extract from inline routes once everything routes through `callLlm()`.
  6. **No-op short-circuit for analyst note** (1–2 days) — opt-in optimization; ship after baseline measured.

  **Estimate:** ~1.5–2 weeks of focused work end-to-end. The first two steps (~3 days) reclaim most of the at-risk margin; quota + budget enforcement (~3–5 days) closes the hard tail.

  **Non-goals:**
  - Switching vendors or self-hosting models (out of scope — this story is governance, not architecture redesign). A separate `[[self-host-llm]]` story can evaluate Llama 3.x on Bedrock once Insight scale justifies it.
  - User-facing "AI usage" meter inside the app (handled as a follow-up `[[user-ai-usage-meter]]`; for now the 429 message is sufficient).
  - Per-feature billing / metered pricing (the current flat-rate Insight plan absorbs cost; a metered tier is a pricing experiment, not a cost-governance story).
  - Rewriting prompts for token efficiency (handled by future quality/cost A/B testing, not this story).
  - Output streaming to the client (the current request/response model is fine for non-chat endpoints; streaming is a different UX investment).
  - Caching across vendor switches (if we move briefing from gpt-4o-mini to Haiku, the response cache should invalidate naturally because the model is part of the hash; explicit invalidation is unnecessary).

### US-014 — Web app (desktop-grade UX + SEO acquisition surface)
**As a** macro investor at a desk who finds mobile alt-data cramped, **and** as a prospect Googling "Nancy Pelosi NVDA trades" or "Trump OGE transactions ticker AAPL", **I want** Monysa to live on the open web at `app.monysa.com` (signed-in product) and `monysa.com` (public, SEO-indexed insight pages) — sharing the existing Express backend and a single accounts system with the mobile app — **so that** I can use the alt-data feeds at the screen size they deserve, and so that organic search becomes a top-of-funnel for paid mobile + paid web conversions instead of relying on the App Store alone.
- Captured: 2026-06-07
- Notes: SWOT Tier-3 strategic bet. Today the only client is the Flutter mobile app at `moby/` talking to the Express backend. There is no web presence beyond a marketing page (if any), no SEO surface, no desktop UX, no account portability story. The alt-data we ship (politician trades, tariff exposure, OGE Presidential, treemaps, macro flows) is *exactly* the content type that performs in organic search — long-tail "[entity] + [ticker] + trades" queries are large, recurring, and low-competition.

  **Top-level decision — stack choice:**
  This story prescribes **Next.js 14+ (App Router) + React + TypeScript + Tailwind + shadcn/ui**, *not* Flutter web. Rationale:
  - **SEO is the acquisition wedge.** Flutter web ships a single JS canvas — terrible for Google indexing, no semantic HTML, slow LCP, no per-page metadata. Next.js gives us static-site generation (SSG) + incremental static regeneration (ISR) per ticker/politician/country, which is the only way the "presidential transactions $TICKER" thesis works.
  - **Desktop UX expectations.** Power users on web expect keyboard shortcuts, dense layouts, tables with column resize/sort, right-click menus — these are first-class in React/shadcn, painful in Flutter web.
  - **Hiring + ecosystem.** Hiring a contractor for React/Next is trivial; Flutter-web contractors with SSR experience are scarce.
  - **Trade-off accepted:** we maintain two clients (Flutter mobile + Next.js web). The backend stays single (Express, no change). Shared model definitions via a generated TypeScript types package consumed by web; mobile already has Dart models — no convergence attempt this round (per `[[design-system-convergence]]` follow-up).

  This decision is the story's primary architectural commitment. If the team later prefers Flutter web, the rest of the story largely applies; flag it as a tech-design follow-up before kickoff.

  **Hard prerequisite — accounts (blocking dependency):**
  Today the app is device-ID gated (`X-Device-ID`). The web app needs user-level identity for: cross-device watchlist/alerts/preferences sync, RevenueCat entitlement portability (mobile-purchased Pro+ subscriber expects to log into web), and paywall logic per session. This story **depends on `[[user-accounts]]`** (referenced in US-006 follow-ups). If accounts haven't shipped, ship them first as a precursor PR; this story does not attempt to design accounts.
  - Email magic-link auth (Resend or Postmark; no passwords).
  - JWT issued server-side, stored in HttpOnly cookie on web, Keychain/Keystore on mobile.
  - RevenueCat user-aliasing: mobile device-ID and web `user_id` both alias to the same RevenueCat App User ID — entitlements follow the user.
  - Backend: `X-Device-ID` continues to work (mobile); new `Authorization: Bearer <jwt>` path for web. Both resolve to the same `Plan` via `plan-enforcement.ts`.

  **Architectural pillars:**

  1. **Two-surface Next.js app.**
     - **`monysa.com` (marketing + SEO surface, unauthenticated, ISR-rendered):**
       - Landing page (positioning, feature highlights, app store links, "Sign in / Start free" CTA).
       - **Programmatic SEO pages** (the strategic payoff):
         - `/politicians/[politician-slug]` — e.g. `/politicians/nancy-pelosi` — all disclosed trades, performance, top holdings. ISR every 6h.
         - `/politicians/[politician-slug]/[ticker]` — e.g. `/politicians/nancy-pelosi/nvda` — that politician's history in one ticker. ISR every 24h.
         - `/presidential/[ticker]` — Trump OGE transactions in one ticker. ISR every 24h.
         - `/congress/[ticker]` — aggregated congress trade flow into a ticker. ISR every 24h.
         - `/insider/[ticker]` — SEC Form 4 (lands with US-009 A) rolling clusters per ticker.
         - `/tariffs/[country-slug]` — tariff exposure summary per country (e.g. `/tariffs/china`). ISR every 24h.
         - `/macro/[indicator-slug]` — e.g. `/macro/vix`, `/macro/yield-curve`. ISR every 1h.
         - `/treemap/[index-slug]` — live snapshot of S&P / Nifty / FTSE / TOPIX (lands with US-010 J). ISR every 5m on cron-trigger during market hours.
         - `/blog/*` — manual editorial content (optional Phase 4).
       - **Each programmatic page renders semantic HTML** (proper `<h1>`, `<article>`, `<table>` with `<thead>/<tbody>`, JSON-LD structured data via `@type: Dataset` and `@type: Article`). No "loading…" client-side hydration as the primary content.
       - Open Graph + Twitter card images generated at build time per page (e.g. politician headshot + ticker chart + key stat).
       - `robots.txt` + `sitemap.xml` auto-generated from the data model — every politician, ticker, country indexed.
       - Goal: own 10k+ long-tail indexed URLs within 6 months; Google Discover surface for trending politician trades.

     - **`app.monysa.com` (signed-in product surface, authenticated, CSR/SSR hybrid):**
       - Mirrors the mobile app's five primary surfaces — Markets / Trading / Investing / Macro / Profile — but as **desktop-first layouts**, not literal mobile ports.
       - Dense multi-pane layouts: watchlist sidebar + chart + signal panel + news pane simultaneously visible (Bloomberg-Terminal mental model, tasteful version).
       - Keyboard shortcuts (`?` modal lists them): `g m` go to Markets, `g i` Investing, `/` search, `j/k` navigate rows, `w` add to watchlist, `c` open chart, `s` open signal.
       - Right-click menus on tickers (chart / signal / backtest / news / add to watchlist / share link).
       - Resizable columns, sortable tables, dense data grids using TanStack Table.
       - Charts via Lightweight Charts v4 (already used by mobile WebView) or TradingView Advanced Chart widget — reuse the existing `tv_symbol.dart` mapping.

  2. **Backend changes (minimal, additive).**
     - Single Express server in `server/` continues to serve both clients. No new backend.
     - New auth middleware accepts **either** `X-Device-ID` (mobile) or `Authorization: Bearer <jwt>` (web). Resolves to the same `Plan`. Living alongside `plan-enforcement.ts`.
     - New endpoints required for SEO ISR:
       - `GET /api/seo/politicians` — full list with slugs (for sitemap generation).
       - `GET /api/seo/politicians/:slug` — per-politician aggregate + recent trades.
       - `GET /api/seo/politicians/:slug/:ticker` — per-politician-per-ticker history.
       - `GET /api/seo/presidential/:ticker` — OGE per-ticker aggregate.
       - `GET /api/seo/tariffs/:countrySlug` — tariff per-country aggregate.
       - `GET /api/seo/sitemap-data` — slim payload Next.js consumes at build time + on revalidation.
     - **CORS update** in `server/index.ts`: today allows `http://localhost:*`. Add `https://monysa.com`, `https://app.monysa.com`, `https://*.vercel.app` (preview deploys). Keep mobile null/opaque origin rejection (per CLAUDE.md pitfall).
     - **HMAC signing** (`APP_SIGNING_SECRET`): web sends the JWT instead — signing middleware accepts JWT *or* HMAC. Both paths terminate at the same plan resolver.
     - **Rate-limiting** (`express-rate-limit`, already in `package.json`): tighter caps on unauthenticated SEO endpoints (50 rps shared) than on signed-in app endpoints (per-user).
     - **No business logic duplication.** Every web feature consumes the same `/api/*` endpoints the mobile app uses. New endpoints exist only for SEO-shape needs.

  3. **Auth & accounts (depends on `[[user-accounts]]`, scoped here for clarity).**
     - Magic-link email auth (Resend/Postmark). Token in URL → server validates → sets HttpOnly cookie.
     - JWT contains `user_id`, `plan`, `device_ids[]` (devices aliased to this user).
     - **RevenueCat user-ID aliasing:** on first web sign-in, claim the user's mobile-purchased entitlement by passing the mobile device-ID (entered manually one-time, *or* magic-linked from mobile via a deep-link → web handshake). One-time UX friction; document it.
     - Web sign-out clears cookie; mobile device-ID continues working independently.
     - Profile page on web lets users view linked devices + manage subscription via RevenueCat customer portal.

  4. **Programmatic SEO content quality.**
     - Each programmatic page must answer the search intent in the first viewport: "Did Nancy Pelosi buy NVDA recently?" → above-the-fold table of her NVDA transactions with date, amount, type.
     - Disclose data source, last-updated timestamp, and a "Data limitations" link (politician trades have ~45d disclosure lag; OGE Form 278-T is annual + spot filings; tariff data quarterly per US-007 refresh story).
     - Internal linking: politician page → linked tickers; ticker page → linked politicians who traded it; cross-link to `/macro/yield-curve` from any politician page mentioning bond trades.
     - Build a "Related" section per page: 5 similar pages, internal links only, to spread link equity.
     - JSON-LD: `Person` schema for politicians, `Article` schema for derived analyses, `Dataset` schema for the trade tables.

  5. **Sharing & growth loops.**
     - Every interesting view on the web app has a shareable URL with OG image generated server-side (e.g. `app.monysa.com/share/signal/NVDA/s2` renders an OG card showing the BUY signal). Falls back to the SEO surface for unauthenticated visitors → "Sign up to see live signals".
     - Mobile "Share" button on signals/trades opens a `monysa.com/share/...` URL — closing the loop: mobile creates web shares → web shares pull traffic back → SEO pages convert.

  6. **Telemetry & growth measurement.**
     - PostHog (or existing analytics) on both surfaces. Funnel: SEO landing → sign-up CTA click → magic link sent → sign-in → first feature used → upgrade (paywall fired) → purchase.
     - Search Console + Plausible / GA4 on `monysa.com` for organic acquisition tracking.
     - Custom dashboards: indexed URLs over time, top organic queries, conversion rate per programmatic page template, time-to-first-action per source.

  7. **Hosting & infra.**
     - **Web app:** Vercel (Next.js native). Free → Pro tier as traffic justifies. ISR + Edge runtime for the programmatic pages; Node runtime for auth + API proxy routes.
     - **Backend:** Fly.io (already deployed per `https://monysa-api.fly.dev` in CLAUDE.md). No change.
     - **Redis:** Upstash (already wired) for SEO ISR cache + LLM quota counters per US-013.
     - **CDN:** Vercel handles automatically; long-tail pages cached at edge.
     - **Domain layout:** `monysa.com` (web, marketing + SEO, Next.js public), `app.monysa.com` (web, signed-in product, Next.js authed), `api.monysa.com` or `monysa-api.fly.dev` (backend, unchanged), `admin.monysa.com` (US-012 + US-013 admin endpoints, behind `ADMIN_TOKEN`).

  **Cross-cutting requirements:**
  - **Backend changes are additive only.** No mobile regression risk. Add new endpoints + new auth path; keep old paths working unchanged.
  - **Plan gates honored identically across surfaces.** A free user on web sees the same gates as on mobile. `EntitlementService` (mobile) and the new `entitlement.ts` (web) read from the same backend `Plan`.
  - **No new vendor lock-in beyond Vercel + Resend/Postmark.** Both swappable; Resend → SES, Vercel → Netlify/Cloudflare Pages with effort.
  - **Design system:** web uses shadcn/ui + Tailwind, theming the same color tokens (`#00D4AA` accent, dark/light) so brand stays consistent. Visual parity is a goal, code reuse is not.
  - **CLAUDE.md updates:**
    - New top-level section "Web client" describing surface URLs, repo location (`web/` at repo root, sibling to `server/` and `moby/`), and which endpoints serve SEO vs. signed-in.
    - New env vars documented: `NEXT_PUBLIC_API_BASE_URL`, `RESEND_API_KEY`, `JWT_SECRET`, `MAGIC_LINK_BASE_URL`, `WEB_ALLOWED_ORIGINS`, `SITEMAP_BUCKET` (if S3-hosted), `REVENUECAT_WEB_PUBLIC_KEY`.
    - New pitfalls:
      - *"Web sends JWT in `Authorization`, mobile sends device-ID in `X-Device-ID`. Both must resolve to the same `Plan` — never special-case web vs. mobile downstream of `plan-enforcement.ts`."*
      - *"Programmatic SEO pages must render meaningful HTML server-side. Do not gate above-the-fold content behind client-side fetches — Googlebot may not execute the JS, and even when it does, LCP suffers."*
      - *"CORS in `server/index.ts` now allows the web origins. Do not loosen further without security review."*
  - **Telemetry:** counters `web.page.view{template}`, `web.signup.start`, `web.signup.complete`, `web.upgrade.click`, `web.upgrade.purchase`, `seo.organic.landing{ticker,politician}`.
  - **Privacy & compliance:** EU/UK visitors trigger a cookie banner (analytics consent). Web introduces GDPR surface area that mobile didn't have; document data subject rights process in `LICENSING.md` (per US-012 pattern).
  - **Tests:**
    - E2E (Playwright): sign-up via magic link → sign in → upgrade flow → see Pro feature → sign out.
    - E2E: SEO page for a known politician renders semantic HTML; assert specific selectors (`h1` matches "Nancy Pelosi"); assert JSON-LD present; assert `lastUpdated` chip visible.
    - Integration: backend JWT + device-ID paths both resolve to the same `Plan` for an aliased user.
    - Integration: CORS allows `app.monysa.com`, rejects `https://evil.com`.
    - Manual: keyboard shortcuts work on macOS Chrome/Safari; column resize persists across reloads (`localStorage`); chart resizes responsively.

  **Acceptance:**
  1. `web/` directory in repo with Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui.
  2. `monysa.com` deployed to Vercel; renders landing + at least one programmatic SEO template populated for ≥ 50 entities (politicians) and ≥ 50 tickers from real backend data.
  3. `app.monysa.com` deployed; signed-in user can use Markets / Trading / Investing / Macro / Profile with desktop layouts (multi-pane where natural).
  4. Backend accepts JWT auth alongside device-ID; both resolve to the same `Plan`.
  5. RevenueCat entitlement portability proven: a Pro mobile user signs into web and sees Pro features.
  6. Sitemap auto-generated; submitted to Google Search Console.
  7. Programmatic page Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms on a 4G profile.
  8. CLAUDE.md updated.
  9. PostHog funnel dashboards live for SEO → signup → upgrade.
  10. EU cookie banner + GDPR data-export endpoint documented.

  **Rollout order** (highest signal / lowest risk first):
  1. **Phase 0 — Accounts** (`[[user-accounts]]`, ~1.5 weeks). Blocking precursor. Magic-link auth, JWT, RevenueCat user-aliasing, mobile device-ID coexistence. Ship this independently — mobile-only users benefit too (cross-device sync).
  2. **Phase 1 — Marketing landing + first SEO template** (~1.5 weeks). `monysa.com` landing page, `/politicians/[slug]` template + sitemap. Deploy with 50 politicians indexed. Validate SEO is working (indexation, impressions) before building more.
  3. **Phase 2 — Programmatic SEO breadth** (~2 weeks). Add `/politicians/[slug]/[ticker]`, `/presidential/[ticker]`, `/congress/[ticker]`, `/tariffs/[country]`. Now 5k–10k indexed URLs.
  4. **Phase 3 — Signed-in `app.monysa.com` MVP** (~3–4 weeks). Markets + Investing + Profile surfaces (the most desktop-friendly). Defer Trading + Macro to Phase 5.
  5. **Phase 4 — Macro + Trading desktop UX** (~2 weeks). Keyboard shortcuts, multi-pane layouts, chart upgrades.
  6. **Phase 5 — Growth loops** (~1 week). Share URLs, OG images, mobile-to-web share buttons.
  7. **Phase 6 — Polish & SEO content scaling** (~ongoing). Editorial blog, related-page graph, internal linking optimization, A/B testing CTAs.

  **Estimate:** ~12–14 weeks of focused work end-to-end (assumes one dedicated frontend engineer, half-time backend support, design as needed). Phase 0 + Phase 1 is the MVP (~3 weeks) and unlocks SEO acquisition independently — ship it and measure before committing to the full signed-in product surface.

  **Non-goals:**
  - Native desktop apps (Electron / Tauri) — web at `app.monysa.com` is sufficient; native desktop is a Tier-5 bet.
  - Sharing logic between Flutter mobile and Next.js web at the widget level — explicitly rejected as scope creep. Backend is the shared layer.
  - Full CMS for editorial content — Phase 6 editorial can use MDX in-repo; a headless CMS (Sanity/Contentful) is `[[cms-integration]]` if the blog warrants it.
  - Real-time WebSocket fan-out to web on Day 1 — wire the existing 30s/60s poll cadence first; real-time treemap + crypto SSE (per US-003 and US-011) can extend to web later.
  - User-generated content / community features (forums, comments) — separate scope, separate moderation cost.
  - Multi-tenant white-label (Enterprise) — handled by `[[enterprise-whitelabel]]` follow-up once B2B demand validated.
  - Internationalization — English-only at launch; `[[i18n-localization]]` covers later.
  - Mobile-web responsive on `app.monysa.com` — desktop-first explicitly; mobile users should use the native app. The marketing `monysa.com` and SEO pages obviously are mobile-responsive.

### US-008 — Split giant feature files into per-sub-tab modules
**As a** developer (and Claude Code in future sessions) **I want** the mega-screens (`trading_screen.dart` 3260 LoC, `volatility_screen.dart` 3070, `investing_screen.dart` 2330, `multibaggers_screen.dart` 1295, `tenx_backtest_screen.dart` 1260, `markets_screen.dart` 1375, `house_trades_tab.dart` 1107) refactored into per-sub-tab files under `features/<screen>/tabs/` **so that** each sub-tab is independently editable, merge conflicts shrink, regressions are scoped, and adding a new tab doesn't require touching a 3k-line file.
- Captured: 2026-06-07
- Notes: SWOT-identified maintainability weakness. Pattern: each screen keeps a thin shell file (`<screen>_screen.dart`, < 300 LoC) that owns AppBar, ThemeToggleButton, sub-tab TabController, and `MaxWidthLayout` wrapping; sub-tabs move to siblings:
  - `features/trading/tabs/` → `dashboard_tab.dart`, `ai_signals_tab.dart`, `alerts_tab.dart`, `power_moves_tab.dart` (+ future `track_record_tab.dart` from US-006).
  - `features/volatility/tabs/` → `dashboard_tab.dart`, `crisis_tab.dart`, `debt_tab.dart`, `calendar_tab.dart` (+ existing `correlation_tab.dart` already split).
  - `features/investing/tabs/` → `exposure_tab.dart`, `dashboard_tab.dart`, `multibaggers_tab.dart`, `presidential_tab.dart`, `congress_tab.dart`, `smart_money_tab.dart` (+ existing `house_trades_tab.dart`, `earnings_calendar_tab.dart`).
  - Internal helper widgets (private `_FooCard` classes) move into `features/<screen>/widgets/` when reused across tabs; tab-local ones stay private inside the tab file.
  - Shared models stay in `data/models/`, repositories in `data/repositories/`.
  Rules: (1) **no behaviour change** — pure structural refactor, no logic touched. (2) one PR per screen (3 PRs minimum), each independently revertable. (3) preserve all existing class names where exported (`MacroScreen` stays in `volatility_screen.dart` per CLAUDE.md pitfall). (4) sub-tab order, default tab, plan gates, and freshness bars stay identical — golden-path manual test per tab in light + dark before merging. (5) follow the existing `extendBody` pitfall — every extracted tab keeps its `EdgeInsets.only(bottom: MediaQuery.padding.bottom + s3)`. (6) update CLAUDE.md "Directory Structure" block at the end of the refactor with the new layout. **Hard target**: no feature file > 800 LoC after the refactor. Suggested order: Investing first (cleanest tab boundaries) → Trading (medium; depends on US-006 landing or carefully merged with it) → Macro (largest; most intra-tab coupling around stress meter math). Estimate: ~5–7 dev-days total across the three PRs including manual regression sweep.

### US-007 — Refresh stale static content (crisis playbook, tariffs, economic calendar)
**As a** Pro+ subscriber (or evaluator) **I want** to see an honest, point-in-time live record of every S1–S9 signal — with entry, SL, TP, current/exit PnL, win-rate, max-drawdown, Sharpe — plus a personal paper portfolio of strategies I follow **so that** I can verify the signals work after I subscribe, not just in backtest.
- Captured: 2026-06-07
- Notes: SWOT-identified #1 churn driver. New `signal_log` store in `server/data/`. Scheduled emitter (15-min cadence during market hours) captures every non-HOLD signal once per `(symbol, strategy)` using only candles closed at-or-before `fired_at` — no peeking. Resolver job marks `hit_tp` / `hit_sl` / `expired` / `closed_eod` with SL-first on intra-bar conflicts. Endpoints: `GET /api/trading/track-record` (public/Free for acquisition), `GET /api/trading/track-record/:strategy/signals`, `GET /api/trading/track-record/freshness`, `POST /api/trading/paper/follow` + `GET /api/trading/paper/portfolio` (Pro+ via `signals_advanced`). Paper portfolio is **never backfilled** — PnL starts at first signal after follow. Open positions excluded from win-rate. New 5th sub-tab "Track Record" in `trading_screen.dart` (tab order: Dashboard / AI Signals / Track Record / Alerts / Power Moves), KPI grid + equity curve sparkline (fl_chart) + recent signals list + honesty banner + methodology bottom sheet (disclose no slippage/fees, link S3/S6/S9 backtest caveats from `server/trading.ts:2405-2408`). Asset Detail Backtest tab gets a "vs. live track record" row when ≥30 signals exist. Phase 1: ship emitter silently for 14 days to accumulate data; Phase 2: UI; Phase 3: paper portfolio. Record is permanent — no retroactive edits after launch. New env: `ENABLE_SIGNAL_LOGGER`.

### US-016 — Currency symbol audit: native vs. USD across all screens
**As a** global user viewing non-US assets (Indian stocks, UK equities, Hong Kong markets, forex pairs) **I want** every price, market cap, and monetary value in the app to display the correct currency symbol — ₹ for INR, £ for GBP, ¥ for JPY, HK$ for HKD, A$ for AUD, etc. — **so that** I never mistake a ₹96,000 Nifty stock price for a $96,000 USD price and make a misinformed trade decision.
- Captured: 2026-06-08
- Notes: Audit of the codebase found 4+ separate ad-hoc currency formatting functions across different files, each with different coverage and different bugs. Specific issues found:

  **Confirmed bugs (show wrong or missing symbol today):**
  - `trading_screen.dart` `_formatPrice()` (line 828) — no currency prefix at all; `QuoteItem.currency` field exists but is ignored. All asset prices in Dashboard and Power Moves rows appear as bare numbers ("96420" not "₹96,420").
  - `asset_detail_screen.dart` `_currencySymbol()` (line 2449) — returns `''` for `'USD'`, so USD prices in fundamentals (52-week range, etc.) display without a `$` prefix. All non-listed currencies (HKD, AUD, CAD, CHF, SGD, KRW, TWD, etc.) also fall through to `''`.
  - `country_stocks_screen.dart` `_formatPrice()` (line 242) — shows `$` only for USD, empty string for everything else; Indian stocks on the India tab show "96,420" not "₹96,420"; UK stocks show "875" not "£875".
  - `sector_treemap.dart` `_pricePrefix()` (line 685) — fallback for unknown currencies returns `$` instead of the ISO code, so e.g. AUD stocks in a future TOPIX-like index would show "$" not "A$".
  - `multibaggers_screen.dart` `_fmtPrice()` — no currency prefix; country chips switch between US/India/UK/Japan/HK/China/Euronext but prices display identically as bare numbers regardless of currency.

  **Missing currencies in symbol maps:** `_kCurrencySymbol` in `sector_treemap.dart` and `_currencySymbol()` in `asset_detail_screen.dart` both omit: `AUD` (A$), `CAD` (CA$), `CHF` (CHF), `SGD` (S$), `KRW` (₩), `TWD` (NT$), `BRL` (R$), `MXN` ($), `IDR` (Rp), `THB` (฿), `VND` (₫), `MYR` (RM), `PHP` (₱).

  **CLAUDE.md pitfall note to re-verify:** "marketCap reported in the listing-currency for non-US indices (Nifty 50 returns INR; the tooltip still prefixes '$' — cosmetic)" — the `_pricePrefix()` function was improved but the CLAUDE.md entry may be stale. Verify against a live Nifty 50 treemap session and update the pitfall table accordingly.

  **Fix approach — single shared utility:**
  Create `moby/lib/utils/currency_format.dart` with:
  - `const kCurrencySymbol = { 'USD': '\$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥', 'INR': '₹', 'HKD': 'HK\$', 'AUD': 'A\$', 'CAD': 'CA\$', 'CHF': 'CHF ', 'SGD': 'S\$', 'KRW': '₩', 'TWD': 'NT\$', 'BRL': 'R\$', 'MXN': '\$', 'IDR': 'Rp ', 'THB': '฿', 'VND': '₫', 'MYR': 'RM ', 'PHP': '₱' }` (narrow non-breaking space before symbol where needed for readability)
  - `String currencyPrefix(String? currency)` — returns symbol from map, falls back to `'${currency ?? ''} '` (ISO code + narrow space, e.g. "SGD 142.50") rather than silently using `$`
  - `String fmtPrice(double? price, { String? currency })` — formats number with correct prefix; handles the >1000 / <1 thresholds already in each ad-hoc impl
  - `String fmtMarketCap(double? v, { String? currency, double? usdEquivalent })` — shows USD primary with native in parens when `usdEquivalent` is available (reuses US-005 pattern); native-only otherwise
  Delete the 4 ad-hoc formatters and replace all call sites with the shared util. No behavior change for USD-only paths — this is purely additive for non-USD.

  **Acceptance per screen:**
  1. Trading → Dashboard: `QuoteItem.currency` drives prefix; Nifty 50 stocks show "₹X,XXX"; FTSE stocks show "£XXX"; Crypto shows "$X.XX"
  2. Trading → Power Moves: same as Dashboard
  3. Country Stocks (India tab): prices show "₹" prefix; exchange chips NSE/BSE don't affect prefix (currency is always INR for both)
  4. Multibaggers (all 7 country tabs): price column shows native symbol per country
  5. Asset Detail → Indicators tab: 52-week range + live price show `$` for USD; non-USD shows correct symbol
  6. Markets → Heatmap treemap: tile tooltip market cap: `$X.XB` for USD; `₹X.XT (≈$X.XB)` for INR when `marketCapUsd` available; `₹X.XT` native-only when FX unavailable
  7. No screen shows a bare number where a currency value is meant
  8. Unknown currencies show ISO code (e.g. "SGD 142.50") rather than a `$` lie

  **Non-goals:** full i18n / locale-aware number separators (that's `[[i18n-localization]]`); converting all prices to user's home currency (separate feature); changing the USD treemap tooltip (already correct).

  **Files to touch:** `moby/lib/utils/currency_format.dart` (new), `sector_treemap.dart`, `asset_detail_screen.dart`, `country_stocks_screen.dart`, `trading_screen.dart`, `multibaggers_screen.dart`, CLAUDE.md pitfall table update.

### US-017 — Redis L2 cache for hot API routes (deploy resilience + thundering-herd protection)
**As the** on-call engineer / product owner **I want** the highest-volume API routes (`/api/futures/*`, `/api/heatmap/treemap`, `/api/trading/signals/:s`, `/api/trading/scanner/*`, `/api/quiver/*`, `/api/house-trades`) to use Upstash Redis as an L2 cache behind the existing in-process L1 — mirroring the OGE Form 278-T pattern (`server/routes/oge.ts`) — **so that** a server restart (deploy, OOM, Fly machine cycle) does not cold-wipe every cache simultaneously and trigger N-user stampedes against Yahoo Finance / FMP / Quiver / Anthropic upstream APIs.
- Captured: 2026-06-08
- Notes: Today every cache except OGE lives in process memory only. With `min_machines_running = 1` and `auto_stop_machines = "off"` ([fly.toml](fly.toml)), the machine is always up — but every deploy cycles the process and wipes 30+ `Map<string, { data, ts }>` caches at once. The first wave of post-deploy requests then races against upstream APIs simultaneously. `_yfInFlight` coalescing ([server/trading.ts:228](server/trading.ts#L228)) partially absorbs this for Yahoo, but signals, futures, treemap, scanners, and FMP-backed routes each see their own cold-start stampede. The risk grows linearly with subscriber count and is the single biggest operational hazard left in the cache layer after US-001 through US-016 land.

  **Architectural pattern** (mirror `server/routes/oge.ts`):
  - Two-layer read: check in-process Map first → on miss, check Redis → on miss, fetch upstream + write both.
  - Two-layer write: every upstream success populates both the in-process Map and Redis with the route's documented TTL.
  - Redis is **optional** — when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent (local dev), the L2 silently skips and L1 alone serves the route exactly as today. This keeps the OGE pattern's "graceful degradation" contract intact.

  **Priority routes** (ordered by user-visible impact + upstream cost):
  1. **`/api/trading/signals/:symbol`** (30s TTL) — highest volume, called from Trading AI Signals tab on every asset view and 30s refresh. Upstream: Yahoo Finance candle fetch + math.
  2. **`/api/futures/indices`, `/api/futures/commodities`, `/api/futures/forex`** (10m TTL) — every device hits these on Markets tab open.
  3. **`/api/heatmap/treemap`** (5m quotes + 24h constituents) — Pro+ users on Markets → Heatmap, CPU-expensive recompute (FX normalization + squarified treemap).
  4. **`/api/trading/scanner/*`** (30m–1h TTL) — slow to compute (50+ symbols × Pine logic), Power Moves tab.
  5. **`/api/quiver/*`, `/api/house-trades`** (4h TTL) — FMP free tier is rate-limited; a cold deploy that hammers FMP exhausts the daily quota for everyone.
  6. **`/api/trading/news/:symbol`** (4h TTL) — Alpha Vantage paid; cold-start cost matters.
  7. **`/api/trading/backtest/:symbol`** (10m TTL) — heavy walk-forward computation; restart pain is real.
  8. **`/api/trading/quotes`** — note: this route reads from `latestPrices` Map populated by the 20s server poll, not from cache lookup per-request. Redis is *not* needed here; the `latestPrices` Map is itself the cache, and the poll resumes within 20s of restart. Document this in CLAUDE.md so future-Claude doesn't add a redundant Redis layer.

  **Implementation skeleton** (per route — same as OGE):
  ```ts
  const REDIS_KEY = (k: string) => `cache:signals:${k}`;
  const TTL_S = 30; // matches in-process TTL

  async function getCached(key: string): Promise<T | null> {
    // L1: in-process map (existing logic untouched)
    const mem = signalCache.get(key);
    if (mem && Date.now() - mem.ts < SIGNAL_TTL) return mem.data;
    // L2: Redis (skip silently if absent)
    if (!redis) return null;
    try {
      const raw = await redis.get<T>(REDIS_KEY(key));
      if (raw) {
        signalCache.set(key, { data: raw, ts: Date.now() }); // warm L1
        return raw;
      }
    } catch (e) { console.warn("[signals] redis get failed:", e); }
    return null;
  }

  async function setCached(key: string, data: T): Promise<void> {
    signalCache.set(key, { data, ts: Date.now() });
    if (!redis) return;
    try { await redis.set(REDIS_KEY(key), data, { ex: TTL_S }); }
    catch (e) { console.warn("[signals] redis set failed:", e); }
  }
  ```

  **Cross-cutting requirements:**
  - **No behavior change in the happy path.** L1 always served first; Redis is a fallback for cold L1 only. Latency profile unchanged for warm caches.
  - **Stampede protection** stays in L1 via the existing in-flight `Promise` maps (`_yfInFlight`, `treemapInFlight`, `assetsInFlightMap`). Redis L2 protects across restarts; in-flight coalescing protects within a process.
  - **Key namespacing.** Use `cache:<route>:<args>` prefix to avoid collision with OGE keys and future features. Document the namespace in CLAUDE.md.
  - **TTL parity.** Redis `ex:` value must equal the L1 TTL — drifting them causes "Redis says fresh, L1 says stale" inconsistencies that surface as flickering data.
  - **No serialization gotchas.** Upstash REST client handles JSON automatically; don't hand-stringify. Verify Date / undefined behavior in tests.
  - **Telemetry.** Counters `cache.hit{route,layer}` for L1/L2/miss; warn if L2 hit rate exceeds 20% (= L1 is too small) or stays at 0% (= Redis broken silently).
  - **CLAUDE.md updates:** new section "Two-layer caching (L1 in-process + L2 Redis)" with the OGE pattern explanation, and a pitfall: *"`/api/trading/quotes` does NOT use the cache pattern — it reads from `latestPrices` populated by a 20s background poll; do not add a Redis layer there."*
  - **Cost.** Upstash pay-as-you-go: $0.20 per 100k commands. At signals 30s TTL × 49 symbols × ~2 commands per miss × moderate traffic → ~$1–3/mo. Scales linearly with paid subscribers.
  - **Out of scope for this story:** Redis pub/sub for cross-machine cache invalidation (only matters if Fly horizontally scales beyond 1 machine — a `[[multi-machine-cache-coherence]]` follow-up).

  **Acceptance:**
  1. Each priority route follows the L1+L2 pattern; in-process behavior unchanged in dev mode (no Redis vars set).
  2. With Redis configured, restart the server → `curl /api/trading/signals/AAPL` returns warm Redis data without an upstream fetch (verify via Yahoo request log).
  3. Telemetry counters increment correctly per layer.
  4. CLAUDE.md updated with the pattern + the `/api/trading/quotes` exclusion pitfall.
  5. Manual: post-deploy "thundering herd" simulation (concurrent 100 requests to `/api/futures/indices` immediately after restart) sees ≤2 upstream Yahoo calls, not 100.

  **Rollout order:**
  1. `/api/trading/signals/:s` (highest volume, biggest win).
  2. `/api/futures/*` (next most hit).
  3. `/api/heatmap/treemap` (Pro+ but CPU-expensive).
  4. `/api/trading/scanner/*`.
  5. `/api/quiver/*` + `/api/house-trades` (FMP quota protection).
  6. `/api/trading/news/:s` + `/api/trading/backtest/:s`.

  **Estimate:** ~1 day end-to-end (mechanical per-route refactor + telemetry + CLAUDE.md). Each route ships independently behind the same pattern.

  **Non-goals:** rewriting in-process caches to a unified abstraction (separate `[[cache-helper-extraction]]` cleanup); horizontal scaling cross-machine invalidation; cache warming on deploy (separate `[[deploy-warmup]]` story if cold-start latency proves user-visible).

### US-018 — Redis L2 cache for AI analyst notes (Anthropic token savings + deploy resilience)
**As the** product owner / on-call engineer **I want** the Pro+-gated AI analyst note endpoint (`/api/trading/analyst-note/:symbol`) to persist generated notes to Upstash Redis with a 1h TTL — alongside the existing 15m in-process cache — **so that** a server restart does not force Anthropic Haiku to regenerate notes for every popular symbol that a user opens, and so that the Anthropic monthly bill stays predictable as subscriber count grows.
- Captured: 2026-06-08
- Notes: Today `_noteCache` ([server/trading.ts:2615](server/trading.ts#L2615)) is a `Map<string, { note, ts }>` with `NOTE_TTL = 15 min` and a per-symbol `_notePending` Promise to coalesce concurrent generations. The dedup is good, but the cache dies on every restart. Each post-deploy first-view of a popular asset → fresh Anthropic Haiku call at `max_tokens: 150`. At ~50 popular symbols × 2 deploys/week × growing subscriber base, this is a slowly-growing constant cost burn that compounds.

  **Pattern:** identical to US-017 — Redis as L2 behind the existing in-process L1, OGE pattern. Note-specific TTL choices:
  - L1 (`_noteCache`): keep at 15 min (current). Notes are short and Anthropic Haiku is cheap; we don't want truly stale market commentary surfaced.
  - L2 (Redis): 1 hour. The note text doesn't reference live price (it's qualitative analysis), so a 1h horizon is acceptable for the deploy-resilience use case. After 1h the L1 + L2 both recompute.

  **Why a separate story from US-017:**
  - **Different upstream cost profile.** US-017 protects against rate-limit / quota exhaustion on free-tier upstreams (Yahoo, FMP). US-018 protects against billable LLM tokens — different dollar dynamics, different acceptable staleness, deserves an independent decision.
  - **Different gating.** Analyst notes are Pro+ via `analyst_notes_unlimited` — lower request volume than `/api/trading/signals/:s`, so Redis command cost is genuinely trivial (~$0.50/mo).
  - **Different audit trail.** LLM-cost governance (see US-013) wants explicit per-vendor counters and budget caps. Wrapping this cache before US-013 lands gives the meter cleaner numbers, since cached hits don't count against the Anthropic quota.

  **Implementation:**
  - Use the same `cache:notes:<symbol>` Redis key pattern as US-017.
  - Preserve the existing `_notePending` in-flight coalescer — it still matters within a process for the rare burst where N users open the same asset within milliseconds.
  - Same graceful degradation: Redis absent → L1-only behavior, identical to today.
  - Add telemetry: `llm.cache.hit{vendor:anthropic,layer:l1|l2|miss}` so US-013's LlmQuota can subtract cache hits from billed-call counts.

  **Acceptance:**
  1. Restart the server, `curl /api/trading/analyst-note/AAPL` → returns Redis-cached note without an Anthropic API call (verify via Anthropic request log or counter).
  2. After 1h Redis TTL expires, next call regenerates and re-warms both layers.
  3. Note text is byte-identical between L1 cache, L2 cache, and a freshly-generated note for the same `(symbol, candles)` input (deterministic prompt — verify the prompt builder doesn't include a timestamp).
  4. With Redis env vars absent (local dev) endpoint behaves exactly as today.
  5. CLAUDE.md updated to list `/api/trading/analyst-note/:symbol` under the two-layer cache pattern.

  **Estimate:** ~2h (single endpoint, same pattern as US-017). Ship after or alongside US-017 — same infra, same review pattern.

  **Cost delta:** +~$0.50/mo Upstash commands. Anthropic savings: ~$1/mo today, scales linearly with paid subscribers — net positive immediately, more so over time.

  **Non-goals:** Anthropic prompt-caching headers (the `cache_control` block on the Haiku call body itself — that's a separate optimization tracked by US-013); semantic dedup of notes across similar candle inputs (too clever; the symbol-keyed cache is enough); cross-region note replication (single-region Upstash is fine).

### US-015 — Live tariff-data refresh via admin API (no deploy required)
**As an** operator **I want** to push an updated tariff dataset to the running server via a single authenticated API call — without redeploying — **so that** rate changes (new executive orders, WTO schedule changes, bilateral agreements) are reflected in the Exposure tab within minutes, not after the next app-store release cycle.
- Captured: 2026-06-08
- Notes: US-007 moved tariff data to `server/data/tariffs.json` + `GET /api/tariffs` (24h cache). The remaining manual step is: edit `server/data/tariffs.json` on the Fly.io VM, bump `TARIFFS_DATA_AS_OF` in `economy.ts`, and restart the process — this requires SSH access and a redeploy, which defeats the purpose of server-side storage. The fix is a thin admin endpoint that accepts a new dataset, writes it atomically to disk, and busts the in-memory cache — no restart, no redeploy, no app release. **Implementation:** `POST /api/admin/tariffs/refresh` — authenticated via `Authorization: Bearer $ADMIN_TOKEN` (new env var, required; 401 if absent or wrong). Body: `{ countries: [...], dataAsOf: "YYYY-MM-DD", source: string }`. Server validates the payload (must be array of ≥ 100 countries with required fields), writes atomically to `server/data/tariffs.json` via `writeFile` + rename (prevents partial reads), clears `tariffsCache` in `economy.ts`, returns `{ ok: true, countries: N, dataAsOf, lastUpdated }`. Export `clearTariffsCache()` from `economy.ts` so the admin route can call it without circular imports. New env var: `ADMIN_TOKEN` (random 32-byte hex; document alongside existing env vars in CLAUDE.md). SOP for quarterly refresh: (1) download latest USTR/WTO schedule, (2) regenerate `countries` array (maintain same `CountryTariff` shape), (3) `curl -X POST https://monysa-api.fly.dev/api/admin/tariffs/refresh -H "Authorization: Bearer $ADMIN_TOKEN" -d @new_tariffs.json`. No Fly.io deploy, no app store submission, cache busts instantly. Acceptance: (1) `POST` with valid token + valid body → 200, cache cleared, next `GET /api/tariffs` returns new data; (2) wrong token → 401; (3) malformed body (< 100 countries, missing required fields) → 422 with descriptive error; (4) file write failure → 500, cache NOT cleared (old data still served); (5) concurrent `GET /api/tariffs` during write sees old data (atomic rename prevents partial read); (6) `ADMIN_TOKEN` env var documented in CLAUDE.md.

---

## In Progress

