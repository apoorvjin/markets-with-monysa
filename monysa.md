# Monysa — Features & Functionality Guide

This document describes every feature and screen in the Monysa app.

---

## App Overview

Monysa is a mobile-first (iOS + Android) and web-compatible financial intelligence app built for people who want to understand global markets without needing a finance degree. Everything is presented in plain English alongside the raw numbers.

The app launches with a 3.2-second animated splash, then opens a random tab each time to encourage discovery of all five sections.

---

## Navigation

The app has **5 main tabs** accessible from the bottom navigation bar:

| Tab | Icon | What it does |
|---|---|---|
| Markets | Trending Up | Live global indices, commodities, and forex |
| Trading | Analytics | AI-powered trading signals for 49 assets |
| Exposure | Globe | US tariff rates by country |
| Volatility | Pulse | Crisis playbook and market stress tools |
| $ Debt | Bar Chart | US national debt explained simply |

---

## Tab 1 — Markets

Real-time data for global financial instruments, split into three sub-tabs.

### Indices Sub-tab
- Live prices for **46 global stock market indices** including S&P 500, Dow Jones, Nasdaq, FTSE 100, DAX, Nikkei 225, Hang Seng, Nifty 50, ASX 200, and more
- Shows current price, daily change (points and %), and whether the exchange is currently open or closed
- Exchange open/closed status based on real-time timezone-aware market hours for 45+ countries
- **Hedge Fund Metals** section — CFTC Commitments of Traders data showing whether institutional money managers are net long or short on Gold, Silver, Copper, Platinum, and Palladium
  - Shows long contracts, short contracts, net position, sentiment label, and week-over-week change
  - Data sourced from the CFTC Disaggregated COT report, updated weekly on Fridays

### Commodities Sub-tab
- Live prices for **23 commodity futures** including Gold, Silver, Crude Oil (WTI), Brent Crude, Natural Gas, Copper, Wheat, Corn, Soybeans, Coffee, Sugar, and more
- All prices shown in USD with unit labels (e.g., "per troy oz", "per barrel", "per bushel")
- Daily change percentage with colour-coded movement

### Forex Sub-tab
- Live rates for **44 currency pairs** across 7 categories:
  - **Majors**: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD
  - **Crosses**: EUR/GBP, EUR/JPY, EUR/AUD, GBP/JPY, and more
  - **Emerging**: USD/CNY, USD/INR, USD/BRL, USD/MXN, and more
  - **Asia-Pacific**: USD/SGD, USD/HKD, USD/KRW, USD/TWD, and more
  - **MENA**: USD/AED, USD/SAR, USD/EGP, and more
  - **Europe**: USD/SEK, USD/NOK, USD/DKK, USD/PLN, and more
  - **Americas**: USD/ARS, USD/CLP, USD/COP, and more

---

## Tab 2 — Trading (AI Trading)

AI-powered trading dashboard for 49 assets across 4 asset classes.

### Asset Coverage (49 Total)
- **14 Commodities**: Gold, Silver, Crude Oil (WTI), Brent Crude, Natural Gas, Copper, Platinum, Palladium, Corn, Wheat, Soybeans, Coffee, Sugar, Cotton
- **15 Indices**: S&P 500, Nasdaq 100, Dow Jones, DAX, FTSE 100, Nikkei 225, Hang Seng, CAC 40, ASX 200, Euro Stoxx 50, Russell 2000, VIX, Nifty 50, KOSPI, Bovespa
- **10 Crypto**: Bitcoin, Ethereum, BNB, Solana, XRP, USDC, Cardano, Avalanche, Dogecoin, Polkadot
- **10 Forex**: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD, EUR/GBP, EUR/JPY, GBP/JPY

### AI Strategy Selection
Three signal strategies selectable at any time via the pill buttons at the top:

| Strategy | Name | Description |
|---|---|---|
| S1 | Technical | Pure price action and technical indicators (RSI, MACD, EMA, Bollinger Bands, ROC, ATR) |
| S2 | Multi-Factor | Same as S1 but with volatility-adaptive thresholds — more conservative in choppy markets |
| S3 | News-Hybrid | S1 technicals (70%) blended with live news sentiment (30%) |

Tap the ⓘ info button to read a detailed plain-English explanation of how each strategy works.

### Markets Sub-tab (Dashboard)
- **Summary bar**: Shows total BUY / HOLD / SELL counts across all visible assets with a LIVE indicator
- **Category filter chips**: Filter by All / Commodities / Indices / Crypto / Forex
- **Search**: Type to filter assets by name or symbol
- **Asset rows**: Each shows flag/emoji, name, symbol, price, daily change %, AI signal badge, confidence bar, and a small sparkline chart
- Tap any asset row to open the full Asset Detail screen
- Tap the sparkline to open a larger 7-day chart modal

### AI Signals Sub-tab
- **Timeframe selector**: 1m / 1h / 4h / 1d — changes the signal calculation timeframe
- **Direction filter**: ALL / BUY / HOLD / SELL — filters to show only assets matching the selected signal
- **Search**: Filter by asset name or symbol
- **Signal cards**: Each card shows:
  - Asset name, symbol, price, and daily change
  - BUY / HOLD / SELL badge
  - Confidence percentage bar (50–95%)
  - Strategy scores (S1, S2, S3 sub-scores as coloured pills)
  - Top reasoning bullet point from the AI
  - Small sparkline chart (tap to expand)
- Pull down to force-refresh all signals

### Alerts Sub-tab
- Set price alerts for any asset (above or below a target price)
- Alerts are sorted by Category, Direction, or Name A-Z
- Tap any alert row to edit the target price or direction
- Swipe or tap the trash icon to delete an alert
- Alert count badge shown on the Alerts tab icon when active alerts exist

---

## Asset Detail Screen

Opened by tapping any asset in the Trading tab. Five sub-tabs:

### Chart
- Full candlestick chart using Lightweight Charts v4 (open source, no ads)
- Range selector: **1M / 3M / 6M / 1Y / 5Y** (5Y uses weekly candles)
- Volume histogram at the bottom
- Crosshair with OHLC (Open / High / Low / Close) values on hover
- Shows recent trade history entries below the chart

### Signal
- Entry price, Stop Loss, and Take Profit levels for the selected strategy
- Risk:Reward ratio displayed clearly
- Full reasoning bullets (5–6 points) explaining why the signal was generated
- Price ladder showing the relationship between entry, SL, and TP

### Indicators
- Live calculated values for all technical indicators:
  - RSI (14-period) with overbought/oversold zones
  - MACD (12/26/9) — line, signal, histogram
  - EMA 12, EMA 26, EMA 50, EMA 200
  - Bollinger Bands (20-period, 2σ) — upper, middle, lower
  - ATR (Average True Range)
- Each indicator has a plain-English description of what it means right now

### Backtest
- Walk-forward backtest (70/30 train/test split) for all three strategies (S1, S2, S3)
- Results table shows: Win Rate, Total Return, Max Drawdown, Sharpe Ratio, Number of Trades
- Note: S3 backtest uses S1 technicals (live news sentiment unavailable historically)

### News
- Up to 8 recent Yahoo Finance headlines for the asset
- Per-article sentiment score (−100 to +100) with colour-coded badge
- Aggregate sentiment score and summary label (Positive / Neutral / Negative)

---

## Tab 3 — Exposure (US Tariff Exposure)

Global tariff rankings showing how much the US taxes imports from each country.

### Country List
- **113+ countries** ranked from highest to lowest tariff rate
- Three summary stats at the top: Highest rate, Average rate, Lowest rate (with country names)
- **Search**: Filter countries by name
- **Sort toggle**: Switch between High→Low and Low→High ranking
- Each row shows: rank number, country flag, country name, sector count, and tariff rate (colour-coded red/amber/green)
- Tap any country to open the Country Detail screen

### Country Detail Screen
When you tap a country, you see:
- Country flag and name with tariff rate prominently displayed
- **Plain-English explanation**: What this tariff means for everyday US consumers
- **5 Sector breakdown**: Each sector (Electronics, Textiles, Agriculture, Chemicals, Machinery) with its own specific tariff rate and a link to the official USTR source
- **Financial exposure table**: How much this country is financially tied to the US economy (Treasury holdings, trade surplus/deficit, FDI)
- **Top Listed Stocks** button: Opens the stocks screen for that country
- Last updated date for the tariff data

### Country Stocks Screen
- Top listed stocks for the selected country with live prices in local currency
- **Sort by**: Rank (#), Price, or Market Cap — tap column headers to toggle ascending/descending
- **Market status badge**: "Market Open" / "Market Closed" / "Closed (Weekend)" based on real-time exchange hours
- **Last refreshed** timestamp showing how recent the data is
- Each stock shows: name, sector, industry, exchange, price, daily change, and market cap
- India has special **NSE / BSE exchange tabs** with up to 250 stocks each
- Tap any stock row to open a candlestick chart for that stock

---

## Tab 4 — Volatility (Crisis Playbook)

Tools for understanding market stress and historical crisis patterns.

### Market Stress Meter
- Visual gauge showing current market stress level (Low / Moderate / High / Extreme)
- Calculated from VIX level, gold movement, and oil movement
- Colour changes from green (calm) to red (extreme stress)

### VIX Gauge
- Live VIX (Volatility Index) price with band label (Normal / Elevated / High / Extreme)
- Brief plain-English explanation of what the current VIX level means

### Crisis-Response Assets Panel
- Live prices and multi-period performance for 6 crisis-sensitive assets:
  - Gold (safe-haven)
  - GDX (Gold Miners ETF)
  - Silver
  - WTI Crude Oil
  - XLE (Energy ETF)
  - US Dollar Index (DXY)
- Each shows: 1-week, 1-month, and 3-month percentage changes
- 30-day sparkline chart for each asset
- Volatility multiplier and directional relationship vs Gold

### Period Toggle
- Switch between time periods (1W / 1M / 3M) to see how assets performed over different windows

### Geopolitical Chain of Events
- Infographic showing the typical chain reaction when a geopolitical shock occurs:
  - Phase 1 (0–48 hours): Immediate market reactions
  - Phase 2 (1–4 weeks): Secondary effects
  - Phase 3 (1–6 months): Long-term repositioning
- Plain-English description of each phase

### Historical Crisis Playbook
- Reference guide for how markets behaved during major historical crises
- Covers: 2008 Financial Crisis, COVID-19 (2020), 1973 Oil Shock, 2022 Ukraine War, 2011 Euro Debt Crisis

### AI Market Briefing
- Tap the briefing button to generate a 3–4 sentence plain-English market stress analysis
- Powered by GPT-4o-mini
- Uses live VIX, gold, oil, and DXY data as inputs
- Cached 30 minutes per unique market condition to avoid unnecessary API calls
- Only available when an OpenAI API key is configured

---

## Tab 5 — $ Debt (US National Debt)

Plain-English breakdown of the US national debt, sourced live from the US Treasury.

### Hero Section
- Total current US national debt displayed prominently
- As of date from the Treasury's official data feed

### Four Information Categories

**The Big Picture**
- Total debt in trillions
- Debt per citizen
- Debt per taxpayer
- Debt-to-GDP ratio
- Daily debt increase
- Annual interest cost

**What It Means For You**
- Plain-English explanations of how national debt affects everyday life
- Mortgage rates, government services, tax burden, dollar purchasing power

**Who Owns Our Debt**
- Breakdown of debt holders: Federal Reserve, foreign governments, US public, government accounts
- Top foreign holders (Japan, China, UK, etc.) with amounts

**Where The Money Goes**
- Federal spending breakdown: Social Security, Defence, Medicare/Medicaid, Interest, other
- Context for what each dollar of debt is funding

---

## Design & Accessibility

- **Dark theme throughout** with teal (`#00BCD4`) accent colour on a deep navy (`#0A0F1E`) background
- **Single consistent theme** — no light/dark toggle; designed specifically for the dark financial aesthetic
- **WCAG AA compliant contrast** — muted text (`#6E7A8F`) achieves ~5:1 contrast ratio
- **44pt minimum touch targets** on all interactive elements (Apple HIG compliant)
- **Financial disclaimer** shown on all screens with trading data
- **Accessibility labels** on all buttons and interactive elements for screen reader support
- **Error boundary** — if any screen crashes, a recovery screen is shown without losing the whole app
- **Inter font family** used throughout (Regular, Medium, SemiBold, Bold weights)
- Data auto-refreshes in the background using React Query with per-endpoint cache durations

---

## Data Refresh Rates

| Data | Refresh Frequency |
|---|---|
| Live stock prices (Trading tab) | Every 10 seconds (polled) |
| Crypto prices (with Finnhub key) | Sub-second via WebSocket |
| Indices / Commodities / Forex | Every 10 minutes |
| AI trading signals | 30-second cache |
| Sparkline / chart history | Every 5 minutes |
| Country stocks | 4-hour cache |
| VIX / crisis assets | 10-minute cache |
| CFTC COT metals report | 4-hour cache (published weekly Fridays) |
| AI volatility briefing | 30-minute cache per market condition |
| US national debt | 12-hour cache |
