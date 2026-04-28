# Monysa — Product Document

## Overview

Monysa is a professional-grade mobile and web financial intelligence application built on Expo React Native. It aggregates global tariff data, live market prices, national debt statistics, and AI-powered crisis analysis into a single, cohesive dark-themed dashboard experience. Designed for investors, trade analysts, policy researchers, and financial professionals who need fast access to macro-level economic data.

---

## Core Capabilities

### 1. Global Tariff Intelligence

- Coverage of **113+ countries** with US reciprocal tariff rates
- **Five sector-specific tariff breakdowns** per country (Manufacturing, Agriculture, Technology, Energy, Services)
- Debt-to-USA relationship data per country
- Plain-English layman explanations for every country's trade exposure
- Verified source URLs linking to official US government references (USTR, Commerce, HTS/USITC)
- Country ranking by tariff rate with full-text search and sort (by name or tariff rate)
- Data reflects April 2025 tariff actions

### 2. Country Detail Pages

- Full-page detail view for every covered country
- Sector tariff breakdown table (5 sectors, individual rates)
- Country-level debt context and relationship to the USA
- Plain-language explanation of trade exposure impact
- Navigation to live stock listings for the country

### 3. Live Global Stock Listings

- Per-country list of top publicly traded stocks fetched live from Yahoo Finance
- **India** supports dual exchange tabs (NSE / BSE) with up to 250 stocks per exchange
- Sortable columns: Rank, Price, Market Cap
- Real-time market status badge: Open / Closed / Closed (Weekend) using timezone-aware exchange hours
- Sector and Industry enrichment via Yahoo Finance search API
- Last-refreshed timestamp showing data age
- 4-hour server-side cache for performance

### 4. Markets Tab (Global Futures & Prices)

Three sub-tabs of live financial data, all cached at 10 minutes:

- **Indices**: 46 global stock exchange indices (S&P 500, Nikkei, DAX, Nifty 50, FTSE, Shanghai Composite, and more) with live price, % change, and market status
- **Commodities**: 23 instruments (Gold, WTI Crude, Brent, Silver, Natural Gas, Wheat, Copper, Platinum, and more) in USD with unit context
- **Forex**: 44 currency pairs across Majors, Crosses, Emerging Markets, Asia-Pac, MENA, Europe, and Americas categories

**TradingView Chart Integration**: Tap any market row to open a full-screen interactive Advanced Chart powered by TradingView (80+ symbol mappings from Yahoo Finance to TradingView exchange:symbol format).

**News modal**: Tap the info icon (ⓘ) on any row to open a news modal independently of the chart.

### 5. USA National Debt Tab

- Four thematic categories of US debt statistics: The Big Picture, What It Means For You, Who Owns Our Debt, Where The Money Goes
- Live US national debt figure fetched from the US Treasury Fiscal Data API (cached 12 hours)
- All statistics presented in plain English, accessible to a general audience
- Fallback to hardcoded values if the Treasury API is unavailable

### 6. Crisis Playbook / Volatility Tab

A dynamic, real-time crisis intelligence dashboard with six integrated features:

**Market Stress Meter**
- Composite stress score (0–100) derived from VIX level, gold price movement, oil volatility, and dollar index
- Color-coded stress band: Calm / Caution / Elevated / Danger / Crisis
- Animated progress bar with live score

**VIX Fear Gauge**
- Live VIX (CBOE Volatility Index) price
- Five-band gauge bar with proportional indicator: Calm (0–15), Caution (15–25), Elevated (25–35), Danger (35–50+), Crisis
- Band label and current reading displayed

**Crisis-Response Asset Tracker**
- Six key assets tracked: Gold, GDX (Gold Miners ETF), Silver, WTI Crude Oil, XLE (Energy ETF), US Dollar Index (DXY)
- Live price, % change for Today / 1W / 1M / 3M periods
- Animated fade transition when switching periods
- Volatility multiplier vs gold shown per asset
- 30-day mini sparkline chart embedded in each card
- Tap any card to open TradingView full-screen chart

**Period Toggle**
- Switchable time horizon: Today / 1 Week / 1 Month / 3 Months
- Updates all asset % change values simultaneously with a smooth fade animation

**Historical Crisis Playbook**
- Six historical crisis events pre-loaded: COVID-19 Crash (2020), 2008 Financial Crisis, 1987 Black Monday, Dot-Com Bubble, 1970s Oil Embargo, 2022 Rate Shock
- Each event is expandable, showing a 3-phase market timeline (Shock, Contagion, Resolution)
- Market impact data per phase (equity, gold, oil, bonds)

**AI Crisis Briefing**
- GPT-4o-mini powered real-time market stress analysis
- Inputs: live VIX level, band, gold/oil/dollar 1M % changes
- Streams 3–4 sentence plain-English briefing via server-sent events (SSE)
- 30-minute server cache keyed on input combination
- Displays generation timestamp and allows regeneration

---

## Technical Architecture Summary

| Layer | Technology |
|---|---|
| Mobile/Web Frontend | Expo SDK 54, React Native 0.81 |
| Routing | expo-router (file-based) |
| State Management | TanStack React Query (server state) + useState (local) |
| Animations | react-native-reanimated + React Native Animated API |
| Charts | TradingView Advanced Chart (WebView) |
| Backend | Express.js 5, Node.js, TypeScript |
| AI | OpenAI GPT-4o-mini via Replit AI Integration |
| Data Sources | Yahoo Finance (stocks, futures), US Treasury Fiscal Data API |
| Database | PostgreSQL via Drizzle ORM |
| Fonts | Inter (Regular, Medium, SemiBold, Bold) |
| Styling | React Native StyleSheet, dark theme |

---

## Platform Support

- iOS (via Expo Go and native build)
- Android (via Expo Go and native build)
- Web (Expo Web / static build)

---

## Data Freshness

| Data Type | Cache Duration |
|---|---|
| Stock prices | 4 hours |
| Futures / Indices / Commodities / Forex | 10 minutes |
| USA national debt | 12 hours |
| Volatility assets + VIX + sparklines | 10 minutes |
| AI Briefing | 30 minutes (per input set) |
| Tariff data | Static (April 2025) |

---

## Design Principles

- Dark-themed financial dashboard aesthetic
- Professional animated intro splash (3.2 seconds)
- Minimal text, icon-first UI
- Inter typeface for numerical readability
- Haptic feedback on native platforms
- Accessible color coding (green/red/amber) for price movements
