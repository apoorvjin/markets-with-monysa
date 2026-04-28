# Monysa — User Manual

**Version**: 1.0  
**Audience**: End users, business analysts, financial professionals  
**Platform**: iOS, Android, Web  

---

## Introduction

Monysa is a financial intelligence app that consolidates global tariff exposure, live market data, US national debt statistics, and AI-driven crisis analysis into one interface. This manual describes each section of the application, the data it presents, and how to interact with it effectively.

---

## Getting Started

### Launch & Splash Screen

When you open Monysa, a professional animated splash screen plays for approximately 3 seconds before automatically transitioning to the main application. No action is required.

### Navigation

The bottom of the screen contains a tab bar with four main sections:

| Tab | Icon | Purpose |
|---|---|---|
| Countries | Globe icon | Browse and search tariff data by country |
| Markets | Chart icon | Live global indices, commodities, and forex |
| USA Debt | Flag icon | US national debt statistics |
| Crisis Playbook | Flame icon | Volatility indicators and AI briefing |

Tap any tab to navigate to that section.

---

## Section 1: Countries Tab

### What It Shows

This is the main country listing screen. It displays all 113+ countries with their applicable US tariff rates, ranked from highest to lowest by default.

### Key Columns

- **Country Name & Flag**: Identifies the country
- **Tariff Rate**: The US reciprocal tariff rate applied to imports from this country, expressed as a percentage

### Interacting with the List

**Search**: Tap the search bar at the top of the screen and begin typing a country name. The list filters in real time.

**Sorting**: Use the sort controls to reorder the list by tariff rate (ascending or descending) or alphabetically by country name.

**Selecting a Country**: Tap any country row to open the Country Detail page.

---

## Section 2: Country Detail Page

### What It Shows

The detail page for each country contains three areas of information:

#### Tariff Summary
The headline tariff rate applied to this country's exports to the USA. A color-coded indicator (green / amber / red) signals severity.

#### Sector Breakdown Table
Five sectors are shown with their individual tariff rates:
- Manufacturing
- Agriculture
- Technology
- Energy
- Services

Each sector may carry a different tariff rate depending on trade agreements and specific import categories.

#### Layman Explanation
A plain-English paragraph describing what the tariff situation means for this country's relationship with the US economy, written to be accessible without financial expertise.

#### Debt Context
Data showing the country's debt relationship to the USA, providing context on economic dependency and leverage.

### Navigating to Stocks

From the Country Detail page, tap the **"View Top Stocks"** button to see live stock prices for that country's exchange.

---

## Section 3: Country Stocks Screen

### What It Shows

A live-updated list of the top publicly listed stocks for the selected country, fetched from Yahoo Finance.

### Columns

| Column | Description |
|---|---|
| # | Market ranking |
| Stock Name | Company name with sector and industry below |
| Price | Current stock price (in local currency) |
| Market Cap | Total market capitalisation (where available) |

### Sorting

Tap any column header (Price, Market Cap, #) to sort the list ascending or descending by that column. The active sort column is highlighted.

### Market Status Badge

At the top of the screen, a badge displays the current status of that country's primary exchange:
- **Market Open** (green): Trading is currently active
- **Market Closed** (grey): Outside trading hours
- **Closed (Weekend)** (grey): It is a Saturday or Sunday in that market's timezone

### Last Refreshed

A timestamp shows when the data was last fetched. Stock data is cached for 4 hours — if the data is older than 4 hours, pull to refresh.

### India (Special Case)

For India, two exchange tabs appear at the top: **NSE** (National Stock Exchange) and **BSE** (Bombay Stock Exchange). Tap each tab to switch between exchanges. Up to 250 stocks are shown per exchange.

---

## Section 4: Markets Tab

The Markets tab provides live global financial market data across three sub-tabs. Tap the sub-tab labels at the top of the screen to switch between them.

### Sub-Tab 1: Indices

Displays live prices for 46 global stock indices including:
- S&P 500, NASDAQ, Dow Jones (USA)
- Nikkei 225 (Japan)
- DAX (Germany)
- FTSE 100 (UK)
- Hang Seng (Hong Kong)
- Nifty 50, Sensex (India)
- Shanghai Composite (China)
- And 37 more

Each row shows: index name, exchange, current price, and % change.

### Sub-Tab 2: Commodities

Live prices for 23 commodities including Gold, WTI Crude Oil, Brent Crude, Silver, Natural Gas, Wheat, Copper, and more. Prices are shown in USD with unit context (per troy oz, per barrel, per bushel, etc.).

### Sub-Tab 3: Forex

Live exchange rates for 44 currency pairs, organised into categories:
- Majors (EUR/USD, GBP/USD, USD/JPY, etc.)
- Crosses (EUR/GBP, EUR/JPY, etc.)
- Emerging Markets
- Asia-Pacific
- MENA
- Europe
- Americas

### Opening a TradingView Chart

Tap any row in Indices, Commodities, or Forex to open a full-screen interactive TradingView Advanced Chart for that instrument. The chart supports all standard TradingView interactions: zoom, scroll, timeframe switching, and drawing tools.

**To close the chart**: Tap the close button (✕) at the top right.

### Opening a News Modal

Tap the **ⓘ** icon on any row to open a news panel for that instrument. The chart and news panel can be used independently.

---

## Section 5: USA Debt Tab

### What It Shows

This tab presents the current US national debt and contextual statistics, all in plain English. Data is fetched live from the US Treasury Fiscal Data API.

The content is organised into four thematic categories:

| Category | Description |
|---|---|
| The Big Picture | Total national debt, annual deficit, debt-to-GDP ratio |
| What It Means For You | Per-citizen share, interest cost per taxpayer |
| Who Owns Our Debt | Breakdown by domestic vs foreign holders |
| Where The Money Goes | Major spending categories funded by borrowing |

Each statistic is accompanied by a plain-English explanation suitable for a general audience. No financial background is required to interpret the data.

---

## Section 6: Crisis Playbook Tab

This tab is the most advanced section of Monysa. It provides a real-time composite view of market stress, crisis-response asset performance, historical crisis analysis, and an AI-generated market briefing.

### 6.1 Market Stress Meter

At the top of the screen, a composite **Market Stress Score** (0–100) is displayed. This score is calculated from:
- Current VIX level (volatility index)
- Gold's 1-month price change
- WTI Oil's 1-month price change
- US Dollar Index (DXY) 1-month price change

The score is colour-coded and labelled:
- **Calm** (0–25): Markets are operating normally
- **Caution** (25–50): Elevated uncertainty, monitor closely
- **Elevated** (50–70): Significant stress, consider defensive positioning
- **Danger** (70–85): High stress, capital preservation mode
- **Crisis** (85–100): Systemic risk indicators are flashing

A progress bar fills proportionally to the score.

### 6.2 VIX Fear Gauge

The **CBOE Volatility Index (VIX)** — often called the market's "fear gauge" — is shown as a live reading on a banded gauge:

| Band | VIX Range | Market Sentiment |
|---|---|---|
| Calm | 0–15 | Low fear, complacency |
| Caution | 15–25 | Moderate uncertainty |
| Elevated | 25–35 | Significant fear |
| Danger | 35–50 | High stress |
| Crisis | 50+ | Extreme fear / systemic event |

A colour-coded indicator sits on the gauge at the current VIX reading.

### 6.3 Crisis-Response Asset Tracker

Six assets are tracked live as "crisis-response" instruments — assets that historically move during market stress events:

| Asset | Ticker | Why It Matters |
|---|---|---|
| Gold | GC=F | Safe-haven reference asset |
| Gold Miners ETF | GDX | Leveraged play on gold (2–3× volatility) |
| Silver | SI=F | Industrial + safe-haven hybrid |
| WTI Crude Oil | CL=F | Energy/inflation indicator |
| Energy ETF | XLE | Equity exposure to energy sector |
| US Dollar Index | DX-Y.NYB | Reserve currency demand indicator |

Each card shows:
- **Current price** (live)
- **% change** for the selected time period
- **Volatility multiplier vs Gold** (how much more volatile this asset is relative to Gold)
- **30-day mini sparkline** chart showing the price trend

#### Switching Time Periods

Use the **Period Toggle** bar above the asset cards to switch between:
- **Today** — intraday % change
- **1W** — 1-week % change
- **1M** — 1-month % change
- **3M** — 3-month % change

All six asset cards update simultaneously. The % change values fade briefly to signal the update.

#### Viewing a Chart

Tap any asset card to open the full TradingView Advanced Chart for that instrument.

### 6.4 Historical Crisis Playbook

Six historical market crises are available for reference, each with a structured 3-phase breakdown:

| Crisis | Year |
|---|---|
| COVID-19 Crash | 2020 |
| Global Financial Crisis | 2008 |
| Black Monday | 1987 |
| Dot-Com Bubble Burst | 2000–2002 |
| 1970s Oil Embargo | 1973–1974 |
| 2022 Rate Shock | 2022 |

**To expand a crisis**: Tap the crisis name row. The card expands to show:
- A brief description of the crisis
- **Phase 1 (Shock)**: Immediate market response
- **Phase 2 (Contagion)**: Spread and deepening impact
- **Phase 3 (Resolution)**: Recovery trajectory and key turning points

Each phase shows the direction and approximate magnitude of movement for: Equities, Gold, Oil, and Bonds.

**To collapse**: Tap the same row again.

### 6.5 AI Crisis Briefing

The **Generate AI Briefing** button (with a sparkle icon) triggers a GPT-4o-mini analysis of current market conditions.

**How It Works**
1. Tap **"Generate AI Briefing"**
2. A panel slides up from the bottom of the screen
3. A loading indicator appears while the AI processes
4. The briefing streams in word by word, appearing progressively
5. On completion, the generation time is shown

The briefing is 3–4 sentences, written in plain English, summarising the current stress environment based on VIX, gold, oil, and dollar data.

**To regenerate**: Once a briefing is displayed, tap **"Regenerate"** inside the panel to request a fresh analysis.

**Note**: Briefings are cached for 30 minutes per identical set of market inputs. If market conditions have not changed significantly, you may receive the same cached briefing.

---

## Data Sources & Reliability

| Data | Source | Update Frequency |
|---|---|---|
| Tariff rates | US Government (USTR, Commerce, HTS) | Static — April 2025 |
| Stock prices | Yahoo Finance Chart API | Every 4 hours |
| Global indices / commodities / forex | Yahoo Finance | Every 10 minutes |
| US national debt | US Treasury Fiscal Data API | Every 12 hours |
| VIX, gold, oil, DXY live prices | Yahoo Finance | Every 10 minutes |
| 30-day sparkline data | Yahoo Finance | Every 10 minutes |
| AI crisis briefing | OpenAI GPT-4o-mini | Every 30 minutes (per input) |

---

## Frequently Asked Questions

**Q: Why does a stock show "—" for Market Cap?**  
A: Market capitalisation data is not always available via the Yahoo Finance public API. This is a data availability limitation, not an application error.

**Q: The AI Briefing says "Could not generate briefing." What do I do?**  
A: This usually indicates a temporary server or AI service issue. Tap "Regenerate" after a few seconds to retry.

**Q: Why do some indices show prices when the market is closed?**  
A: Yahoo Finance returns the last known trading price, which may be from the previous session. The market status badge tells you whether the exchange is currently open.

**Q: Can I use Monysa offline?**  
A: Some screens (tariff data, US debt statistics) may display cached data if you have recently visited them. Live data features (stocks, futures, volatility) require an active internet connection.

**Q: How often does tariff data update?**  
A: Tariff data reflects the April 2025 US tariff actions and is statically embedded in the app. It does not update automatically. Users should consult official government sources for the most current rates.
